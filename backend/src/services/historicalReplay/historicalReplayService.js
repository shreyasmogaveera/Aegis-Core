const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');
const JSZip = require('jszip');

const REPLAY_DIR = path.resolve(
  __dirname,
  '../../../../historical-replay'
);

const FILES = {
  floodSequences: path.join(
    REPLAY_DIR,
    'Flood_Sequences_M7_FROZEN.npz'
  ),
  floodMetadata: path.join(
    REPLAY_DIR,
    'Flood_Sequence_Metadata_M7_FROZEN.csv'
  ),
  floodLabels: path.join(
    REPLAY_DIR,
    'Flood_Labels_FROZEN_2015_2024.csv'
  ),
  landslideSequences: path.join(
    REPLAY_DIR,
    'Landslide_Sequences_M7_FROZEN.npz'
  ),
  landslideMetadata: path.join(
    REPLAY_DIR,
    'Landslide_Sequence_Metadata_M7_FROZEN.csv'
  ),
  landslideLabels: path.join(
    REPLAY_DIR,
    'Landslide_Labels_GSI_UPDATED_DISTRICT_DAY_2015_2024.csv'
  )
};

function assertFile(filePath) {
  if (!fs.existsSync(filePath)) {
    const err = new Error(
      `Historical replay artifact not found: ${filePath}`
    );
    err.status = 503;
    throw err;
  }
}

function normalizeDate(value) {
  const text = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const err = new Error(
      'target_date must use YYYY-MM-DD format'
    );
    err.status = 400;
    throw err;
  }

  return text;
}

function normalizeHazard(value) {
  const hazard = String(value || '').toLowerCase();

  if (!['flood', 'landslide'].includes(hazard)) {
    const err = new Error(
      `Unsupported hazard: ${value}`
    );
    err.status = 400;
    throw err;
  }

  return hazard;
}

function normalizeDistrict(value) {
  const district = String(value || '').trim();

  const allowed = [
    'Kodagu',
    'Uttara Kannada',
    'Belagavi',
    'Bagalkot'
  ];

  const match = allowed.find(
    (item) => item.toLowerCase() === district.toLowerCase()
  );

  if (!match) {
    const err = new Error(
      `Unsupported district: ${district}`
    );
    err.status = 400;
    throw err;
  }

  return match;
}

function parseCsv(filePath) {
  assertFile(filePath);

  return csv.parse(
    fs.readFileSync(filePath, 'utf8'),
    {
      columns: true,
      skip_empty_lines: true,
      bom: true
    }
  );
}

function loadMetadata(hazard) {
  return parseCsv(
    hazard === 'flood'
      ? FILES.floodMetadata
      : FILES.landslideMetadata
  );
}

function loadLabels(hazard) {
  return parseCsv(
    hazard === 'flood'
      ? FILES.floodLabels
      : FILES.landslideLabels
  );
}

/*
 * M7 NPZ reader.
 *
 * The M7 files contain NumPy .npy arrays inside a ZIP archive.
 * We intentionally parse only the X array required for replay.
 *
 * No y/target value is ever sent to the model.
 */
function readNpyArray(buffer) {
  const magic = buffer.subarray(0, 6).toString('latin1');

  if (magic !== '\x93NUMPY') {
    throw new Error('Invalid NumPy array header');
  }

  const major = buffer[6];
  const minor = buffer[7];

  let headerLength;
  let headerOffset;

  if (major === 1) {
    headerLength = buffer.readUInt16LE(8);
    headerOffset = 10;
  } else if (major === 2 || major === 3) {
    headerLength = buffer.readUInt32LE(8);
    headerOffset = 12;
  } else {
    throw new Error(
      `Unsupported NumPy format version ${major}.${minor}`
    );
  }

  const header = buffer
    .subarray(
      headerOffset,
      headerOffset + headerLength
    )
    .toString('latin1');

  const descrMatch = header.match(/'descr':\s*'([^']+)'/);
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  const fortranMatch = header.match(
    /'fortran_order':\s*(True|False)/
  );

  if (!descrMatch || !shapeMatch || !fortranMatch) {
    throw new Error('Unable to parse NumPy array header');
  }

  const dtype = descrMatch[1];
  const shape = shapeMatch[1]
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map(Number);

  const fortranOrder = fortranMatch[1] === 'True';

  if (fortranOrder) {
    throw new Error(
      'Fortran-order replay arrays are not supported'
    );
  }

  if (dtype !== '<f4') {
    throw new Error(
      `Expected float32 little-endian replay array, got ${dtype}`
    );
  }

  const dataOffset =
    headerOffset + headerLength;

  const elementCount =
    shape.reduce((a, b) => a * b, 1);

  const expectedBytes =
    elementCount * 4;

  if (
    buffer.length - dataOffset <
    expectedBytes
  ) {
    throw new Error(
      'NumPy array payload is truncated'
    );
  }

  const values = new Float32Array(
    buffer.buffer,
    buffer.byteOffset + dataOffset,
    elementCount
  );

  return {
    shape,
    values
  };
}

async function loadNpzArray(filePath, arrayName) {
  assertFile(filePath);

  const JSZipModule = require('jszip');
  const zip = await JSZipModule.loadAsync(
    fs.readFileSync(filePath)
  );

  const entryName = `${arrayName}.npy`;
  const entry = zip.file(entryName);

  if (!entry) {
    throw new Error(
      `NPZ array ${arrayName} not found in ${filePath}`
    );
  }

  const buffer = await entry.async('nodebuffer');

  return readNpyArray(buffer);
}

async function getReplaySequence(
  hazard,
  district,
  targetDate
) {
  const metadata = loadMetadata(hazard);

  const row = metadata.find(
    (item) =>
      String(item.district).trim().toLowerCase() ===
        district.toLowerCase() &&
      String(item.target_date).trim() === targetDate
  );

  if (!row) {
    const err = new Error(
      `No frozen M7 sequence is available for ${hazard} / ${district} / ${targetDate}`
    );
    err.status = 404;
    throw err;
  }

  const index = metadata.indexOf(row);

  const npz = await loadNpzArray(
    hazard === 'flood'
      ? FILES.floodSequences
      : FILES.landslideSequences,
    hazard === 'flood'
      ? 'X_flood'
      : 'X_landslide'
  );

  if (npz.shape.length !== 3) {
    throw new Error(
      `Invalid ${hazard} replay sequence shape`
    );
  }

  if (npz.shape[0] !== metadata.length) {
    throw new Error(
      `Metadata/sequence count mismatch for ${hazard}`
    );
  }

  if (index < 0 || index >= npz.shape[0]) {
    throw new Error(
      `Invalid replay sequence index: ${index}`
    );
  }

  const sequenceLength = Number(
    row.sequence_length
  );

  const expectedLength =
    hazard === 'flood' ? 15 : 30;

  if (sequenceLength !== expectedLength) {
    throw new Error(
      `Invalid stored sequence length for ${hazard}: ${sequenceLength}`
    );
  }

  const featureCount = 15;

  if (
    npz.shape[1] !== expectedLength ||
    npz.shape[2] !== featureCount
  ) {
    throw new Error(
      `Invalid stored ${hazard} sequence dimensions`
    );
  }

  const offset =
    index *
    expectedLength *
    featureCount;

  const sequence = [];

  for (let t = 0; t < expectedLength; t += 1) {
    const timestep = [];

    for (let f = 0; f < featureCount; f += 1) {
      const value =
        npz.values[
          offset +
          t * featureCount +
          f
        ];

      timestep.push(
        Number.isFinite(value)
          ? Number(value)
          : null
      );
    }

    sequence.push(timestep);
  }

  return {
    sequence,
    metadata: row
  };
}

function findHistoricalLabel(
  hazard,
  district,
  targetDate
) {
  const labels = loadLabels(hazard);

  const row = labels.find(
    (item) => {
      const rowDistrict =
        String(
          item.District ||
          item.district ||
          ''
        ).trim();

      const rowDate =
        String(
          item.Date ||
          item.date ||
          item.target_date ||
          ''
        ).trim();

      return (
        rowDistrict.toLowerCase() ===
          district.toLowerCase() &&
        rowDate === targetDate
      );
    }
  );

  if (!row) {
    return {
      available: false,
      value: null
    };
  }

  const raw =
    row.Flood_Label ??
    row.flood_label ??
    row.Landslide_Label ??
    row.landslide_label ??
    row.Landslide ??
    row.landslide ??
    row.Label ??
    row.label ??
    row.target;

  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ''
  ) {
    return {
      available: false,
      value: null
    };
  }

  const text = String(raw).trim();

  if (
    text.toLowerCase() === 'nan' ||
    text.toLowerCase() === 'null'
  ) {
    return {
      available: false,
      value: null
    };
  }

  const numeric = Number(text);

  if (!Number.isFinite(numeric)) {
    return {
      available: false,
      value: null
    };
  }

  return {
    available: true,
    value: numeric
  };
}

class HistoricalReplayService {
  async getReplayInput(
    hazardInput,
    districtInput,
    targetDateInput
  ) {
    const hazard = normalizeHazard(hazardInput);
    const district = normalizeDistrict(districtInput);
    const targetDate = normalizeDate(targetDateInput);

    const result = await getReplaySequence(
      hazard,
      district,
      targetDate
    );

    return {
      hazard,
      district,
      targetDate,
      sequence: result.sequence,
      sequenceLength: Number(
        result.metadata.sequence_length
      ),
      sequenceStart:
        result.metadata.sequence_start,
      sequenceEnd:
        result.metadata.sequence_end,
      historicalLabel:
        findHistoricalLabel(
          hazard,
          district,
          targetDate
        )
    };
  }
}

module.exports = new HistoricalReplayService();

