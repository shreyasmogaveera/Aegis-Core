const http = require('http');

/**
 * MLBridgeService
 *
 * Node/Express -> Flask -> frozen AEGIS-CORE M11 LSTM.
 *
 * IMPORTANT:
 * This bridge does not manufacture history, fallback telemetry,
 * thresholds, confidence, or risk levels.
 *
 * The caller must provide the exact M12 sequence contract:
 *   Flood      = 15 x 15
 *   Landslide  = 30 x 15
 */
class MLBridgeService {
  constructor() {
    this.mlServiceUrl =
      process.env.ML_SERVICE_URL || 'http://localhost:5001/api/v1';
  }

  async _postToFlask(endpoint, payload) {
    const fullUrl = `${this.mlServiceUrl}${endpoint}`;

    if (typeof fetch !== 'undefined') {
      let response;

      try {
        response = await fetch(fullUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        const netErr = new Error(
          `Flask ML Service unreachable: ${err.message}`
        );
        netErr.status = 503;
        throw netErr;
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const err = new Error(
          body.error ||
          `Flask ML Service returned HTTP ${response.status}`
        );
        err.status = response.status;
        throw err;
      }

      return body;
    }

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(fullUrl);
      const postData = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          let jsonBody = {};

          try {
            jsonBody = JSON.parse(body);
          } catch (_) {}

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonBody);
            return;
          }

          const err = new Error(
            jsonBody.error ||
            `Flask ML Service returned HTTP ${res.statusCode}`
          );
          err.status = res.statusCode;
          reject(err);
        });
      });

      req.on('error', (err) => {
        const netErr = new Error(
          `Flask ML Service connection failed: ${err.message}`
        );
        netErr.status = 503;
        reject(netErr);
      });

      req.write(postData);
      req.end();
    });
  }

  _validateSequence(sequence, expectedLength) {
    if (!Array.isArray(sequence)) {
      throw new Error('sequence must be an array');
    }

    if (sequence.length !== expectedLength) {
      throw new Error(
        `sequence must contain exactly ${expectedLength} timesteps`
      );
    }

    for (let t = 0; t < sequence.length; t += 1) {
      if (!Array.isArray(sequence[t]) || sequence[t].length !== 15) {
        throw new Error(
          `sequence[${t}] must contain exactly 15 feature channels`
        );
      }

      for (let f = 0; f < sequence[t].length; f += 1) {
        const value = sequence[t][f];

        if (
          typeof value !== 'number' &&
          value !== null
        ) {
          throw new Error(
            `sequence[${t}][${f}] must be numeric or null`
          );
        }

        if (typeof value === 'number' && !Number.isFinite(value)) {
          throw new Error(
            `sequence[${t}][${f}] must be finite`
          );
        }
      }
    }
  }

  async predictFlood(district, input = {}) {
    const {
      target_date,
      mode = 'live',
      sequence
    } = input;

    this._validateSequence(sequence, 15);

    return await this._postToFlask('/predict/flood', {
      district,
      target_date,
      mode,
      sequence
    });
  }

  async predictLandslide(district, input = {}) {
    const {
      target_date,
      mode = 'live',
      sequence
    } = input;

    this._validateSequence(sequence, 30);

    return await this._postToFlask('/predict/landslide', {
      district,
      target_date,
      mode,
      sequence
    });
  }

  async predictRisk(district, input = {}, predictionType = 'flood') {
    const hazard = String(predictionType).toLowerCase();

    if (hazard === 'landslide') {
      return await this.predictLandslide(district, input);
    }

    if (hazard === 'flood') {
      return await this.predictFlood(district, input);
    }

    throw new Error(`Unsupported prediction type: ${predictionType}`);
  }
}

module.exports = new MLBridgeService();
