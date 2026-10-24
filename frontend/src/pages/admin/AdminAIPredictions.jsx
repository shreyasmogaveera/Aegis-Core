import React, { useMemo, useState } from 'react';

const API_BASE =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

const DISTRICTS = {
  flood: ['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'],
  landslide: ['Kodagu', 'Uttara Kannada']
};

export const AdminAIPredictions = () => {
  const [mode, setMode] = useState('historical_replay');
  const [predictionType, setPredictionType] = useState('landslide');
  const [district, setDistrict] = useState('Uttara Kannada');
  const [targetDate, setTargetDate] = useState('2024-07-04');

  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const districts = useMemo(
    () => DISTRICTS[predictionType],
    [predictionType]
  );

  const handleHazardChange = (event) => {
    const hazard = event.target.value;
    setPredictionType(hazard);
    setDistrict(DISTRICTS[hazard][0]);
    setPrediction(null);
    setError('');
  };

  const runLivePrediction = async () => {
    setLoading(true);
    setError('');
    setPrediction(null);

    try {
      const token = localStorage.getItem('aegis_token');

      if (!token) {
        throw new Error(
          'Authentication token not found. Please sign in again.'
        );
      }

      const response = await fetch(
        `${API_BASE}/predictions/trigger`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            district,
            predictionType,
            mode: 'live'
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Live prediction trigger failed (HTTP ${response.status})`
        );
      }

      setPrediction(data.prediction);
    } catch (err) {
      setError(
        err.message ||
          'Unable to trigger live prediction.'
      );
    } finally {
      setLoading(false);
    }
  };

  const runHistoricalReplay = async () => {
    setLoading(true);
    setError('');
    setPrediction(null);

    try {
      const token = localStorage.getItem('aegis_token');

      if (!token) {
        throw new Error(
          'Authentication token not found. Please sign in again.'
        );
      }

      const response = await fetch(
        `${API_BASE}/predictions/historical-replay`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            district,
            predictionType,
            target_date: targetDate
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Historical replay failed (HTTP ${response.status})`
        );
      }

      setPrediction(data.prediction);
    } catch (err) {
      setError(
        err.message ||
          'Unable to run historical replay.'
      );
    } finally {
      setLoading(false);
    }
  };

  const probability =
    typeof prediction?.eventProbability === 'number'
      ? prediction.eventProbability
      : null;

  const probabilityPercent =
    probability !== null
      ? (probability * 100).toFixed(2)
      : null;

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">
              psychology
            </span>
            AI Prediction Center
          </h1>
        </div>

        <span className="bg-primary/10 text-primary font-label-caps text-[11px] px-3 py-1 rounded font-bold flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          FROZEN LSTM ENGINE
        </span>
      </header>

      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Mode */}
          <section className="glass-panel p-6 rounded-xl">
            <div className="flex flex-col lg:flex-row lg:items-end gap-5">
              <div className="flex-1">
                <label className="block font-label-caps text-[11px] text-on-surface-variant mb-2">
                  PREDICTION MODE
                </label>

                <select
                  value={mode}
                  onChange={(e) => {
                    setMode(e.target.value);
                    setPrediction(null);
                    setError('');
                  }}
                  className="w-full bg-surface-container border border-white/10 rounded-lg px-4 py-3 text-on-surface cursor-pointer"
                >
                  <option value="historical_replay">
                    Historical Replay Benchmark
                  </option>
                  <option value="live">
                    Live Operational Pipeline
                  </option>
                </select>
              </div>

              {mode === 'live' ? (
                <div className="flex-1 bg-surface-container rounded-lg px-4 py-3 border border-white/10">
                  <div className="font-label-caps text-[11px] text-primary flex items-center gap-1.5 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                    LIVE OPERATIONAL PIPELINE
                  </div>
                  <div className="text-xs text-on-surface-variant mt-1">
                    Connects directly to the active live inference pipeline and Level 2 calibration engine. Results synchronize with Tactical Overview and Risk Analysis in real time.
                  </div>
                </div>
              ) : (
                <div className="flex-1 bg-surface-container rounded-lg px-4 py-3 border border-white/10">
                  <div className="font-label-caps text-[11px] text-on-surface-variant">
                    HISTORICAL REPLAY MODE
                  </div>
                  <div className="text-xs text-on-surface-variant mt-1">
                    Evaluates the frozen M11 LSTM model against historical 30-day meteorological sequences from past disaster events.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Inference Execution Controls */}
          <section className="glass-panel p-6 rounded-xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">
                {mode === 'live' ? 'online_prediction' : 'history'}
              </span>
              <h2 className="font-label-caps text-on-surface-variant text-[12px]">
                {mode === 'live' ? 'LIVE INFERENCE EXECUTION' : 'HISTORICAL REPLAY BENCHMARK'}
              </h2>
            </div>

            {/* Informative Academic / Operational Banner */}
            {mode === 'historical_replay' ? (
              <div className="bg-primary/10 border border-primary/25 rounded-xl p-4 mb-5 text-xs text-on-surface leading-relaxed">
                <div className="flex items-center gap-2 font-bold text-primary mb-1">
                  <span className="material-symbols-outlined text-base">school</span>
                  <span>Ground-Truth Model Evaluation Mode (Academic & Defense Review)</span>
                </div>
                <p className="text-on-surface-variant mt-1">
                  This tool runs the frozen <strong>AegisCore M11 LSTM</strong> inference engine against historical 30-day meteorological sequences from past disaster events (e.g., July 2024 Uttara Kannada landslide). It evaluates whether the model would have accurately detected the disaster ahead of time against ground-truth historical records.
                </p>
                <div className="mt-2.5 text-[11px] font-mono text-primary flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Replay mode uses archived training/validation datasets · Output reflects historical validation, not a live forecast
                </div>
              </div>
            ) : (
              <div className="bg-primary/10 border border-primary/25 rounded-xl p-4 mb-5 text-xs text-on-surface leading-relaxed">
                <div className="flex items-center gap-2 font-bold text-primary mb-1">
                  <span className="material-symbols-outlined text-base">sensors</span>
                  <span>Live Production Telemetry & Calibrated Operational Engine</span>
                </div>
                <p className="text-on-surface-variant mt-1">
                  Triggers real-time evaluation using the latest environmental telemetry matrix and AegisCore's calibrated Level 2 inference engine. Results update the state-wide emergency database, Tactical Overview, and Risk Analysis dashboards simultaneously.
                </p>
                <div className="mt-2.5 text-[11px] font-mono text-primary flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  Live mode evaluates current district conditions · Synchronized with Tactical Overview & Risk Analysis
                </div>
              </div>
            )}

            <div className={`grid grid-cols-1 ${mode === 'live' ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-5`}>
              <div>
                <label className="block font-label-caps text-[11px] text-on-surface-variant mb-2">
                  HAZARD
                </label>
                <select
                  value={predictionType}
                  onChange={handleHazardChange}
                  className="w-full bg-surface-container border border-white/10 rounded-lg px-4 py-3 text-on-surface cursor-pointer"
                >
                  <option value="flood">Flood</option>
                  <option value="landslide">Landslide</option>
                </select>
              </div>

              <div>
                <label className="block font-label-caps text-[11px] text-on-surface-variant mb-2">
                  DISTRICT
                </label>
                <select
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    setPrediction(null);
                    setError('');
                  }}
                  className="w-full bg-surface-container border border-white/10 rounded-lg px-4 py-3 text-on-surface cursor-pointer"
                >
                  {districts.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {mode === 'historical_replay' && (
                <div>
                  <label className="block font-label-caps text-[11px] text-on-surface-variant mb-2">
                    HISTORICAL DATE
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => {
                      setTargetDate(e.target.value);
                      setPrediction(null);
                      setError('');
                    }}
                    className="w-full bg-surface-container border border-white/10 rounded-lg px-4 py-3 text-on-surface"
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={mode === 'live' ? runLivePrediction : runHistoricalReplay}
              disabled={loading}
              className="mt-5 px-5 py-3 rounded-lg bg-primary text-on-primary font-bold disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {loading && <span className="material-symbols-outlined text-sm animate-spin">sync</span>}
              {loading
                ? mode === 'live'
                  ? 'Triggering Live Inference Pipeline...'
                  : 'Running Frozen LSTM Replay...'
                : mode === 'live'
                ? 'Trigger Live Prediction'
                : 'Run Historical Replay'}
            </button>

            {error && (
              <div className="mt-4 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}
          </section>

          {/* Result */}
          <section className="glass-panel p-6 rounded-xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  {mode === 'live' ? 'insights' : 'model_training'}
                </span>
                <h2 className="font-label-caps text-on-surface-variant text-[12px]">
                  {mode === 'live' ? 'LIVE INFERENCE PIPELINE OUTPUT' : 'HISTORICAL MODEL EVALUATION OUTPUT'}
                </h2>
              </div>
              {prediction && (
                mode === 'live' ? (
                  <span className="bg-primary/10 text-primary border border-primary/30 text-[10px] font-mono px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                    LIVE PIPELINE · OPERATIONAL INFERENCE
                  </span>
                ) : (
                  <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-mono px-2.5 py-1 rounded-full font-bold">
                    HISTORICAL REPLAY · ARCHIVED DATA
                  </span>
                )
              )}
            </div>

            {!prediction && !loading && (
              <div className="py-12 text-center text-on-surface-variant">
                {mode === 'live'
                  ? 'Select a hazard and district, then trigger a live operational prediction.'
                  : 'Select a historical hazard, district and date, then run the replay.'}
              </div>
            )}

            {loading && (
              <div className="py-12 text-center text-on-surface-variant flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-primary animate-spin">sync</span>
                {mode === 'live'
                  ? 'Executing live inference pipeline and Level 2 threshold calibration...'
                  : 'Running the frozen M11 LSTM pipeline against 30-day historical sequence...'}
              </div>
            )}

            {prediction && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="bg-surface-container rounded-lg p-5">
                    <div className="font-label-caps text-[10px] text-on-surface-variant">
                      {mode === 'live' && prediction.calibratedProbability !== null && prediction.calibratedProbability !== undefined
                        ? 'CALIBRATED RISK PROBABILITY'
                        : 'EVALUATED EVENT PROBABILITY'}
                    </div>
                    <div className="font-data-mono text-4xl font-bold text-primary mt-2">
                      {mode === 'live' && prediction.calibratedProbability !== null && prediction.calibratedProbability !== undefined
                        ? `${(prediction.calibratedProbability * 100).toFixed(2)}%`
                        : `${probabilityPercent}%`}
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
                      {mode === 'live' && prediction.calibratedProbability !== null && prediction.calibratedProbability !== undefined
                        ? `Raw Frozen LSTM Output: ${probabilityPercent}%`
                        : 'Frozen LSTM Model Raw Output'}
                    </div>
                  </div>

                  <div className="bg-surface-container rounded-lg p-5">
                    <div className="font-label-caps text-[10px] text-on-surface-variant">
                      {mode === 'live' ? 'OPERATIONAL RISK TIER' : 'EVALUATION CLASSIFICATION'}
                    </div>
                    <div className={`font-data-mono text-xl font-bold mt-2 ${
                      prediction.riskLevel === 'CRITICAL'
                        ? 'text-error'
                        : prediction.riskLevel === 'HIGH'
                        ? 'text-orange-400'
                        : prediction.riskLevel === 'MODERATE'
                        ? 'text-yellow-400'
                        : 'text-sky-400'
                    }`}>
                      {prediction.riskLevel || prediction.predictionStatus || 'UNKNOWN'}
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
                      {prediction.operationalDecision
                        ? prediction.operationalDecision.replace(/_/g, ' ')
                        : 'Threshold Decision Status'}
                    </div>
                  </div>

                  <div className="bg-surface-container rounded-lg p-5">
                    <div className="font-label-caps text-[10px] text-on-surface-variant">
                      {mode === 'live' ? 'CALIBRATION ENGINE' : 'GROUND-TRUTH BENCHMARK'}
                    </div>
                    {mode === 'live' ? (
                      <div>
                        <div className="text-sm font-bold text-primary mt-2 flex items-center gap-1.5 font-mono">
                          <span className="material-symbols-outlined text-base">verified</span>
                          <span>
                            {prediction.decisionEngine
                              ? prediction.decisionEngine.replace(/_/g, ' ').toUpperCase()
                              : 'LEVEL 2 CALIBRATED'}
                          </span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
                          Synchronized with Tactical Overview
                        </div>
                      </div>
                    ) : prediction.historicalComparison?.available ? (
                      Number(prediction.historicalComparison.label) === 1 ? (
                        <div className="text-sm font-bold text-amber-400 mt-2 flex items-center gap-1.5 font-mono">
                          <span className="material-symbols-outlined text-base">warning</span>
                          <span>1 (Confirmed Disaster Event)</span>
                        </div>
                      ) : (
                        <div className="text-sm font-bold text-sky-400 mt-2 flex items-center gap-1.5 font-mono">
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          <span>0 (Normal / No Event)</span>
                        </div>
                      )
                    ) : (
                      <div className="font-data-mono text-sm text-on-surface-variant mt-2">
                        Label Unavailable
                      </div>
                    )}
                    <div className="text-[10px] text-on-surface-variant mt-1 font-mono">
                      {mode === 'live' ? 'Live Telemetry Ingestion' : 'Actual Verified Historical Record'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-surface-container rounded-lg p-5">
                    <div className="font-label-caps text-[10px] text-on-surface-variant mb-3">
                      {mode === 'live' ? 'OPERATIONAL WINDOW' : 'REPLAY WINDOW'}
                    </div>

                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-on-surface-variant">
                        District
                      </span>
                      <span className="font-data-mono text-sm">
                        {prediction.district}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-on-surface-variant">
                        Hazard
                      </span>
                      <span className="font-data-mono text-sm">
                        {prediction.predictionType}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-on-surface-variant">
                        {mode === 'live' ? 'Evaluation Date' : 'Target date'}
                      </span>
                      <span className="font-data-mono text-sm">
                        {prediction.targetDate || 'Live Telemetry Cycle'}
                      </span>
                    </div>

                    <div className="flex justify-between py-2">
                      <span className="text-sm text-on-surface-variant">
                        Sequence
                      </span>
                      <span className="font-data-mono text-sm">
                        {prediction.sequenceStart} →{' '}
                        {prediction.sequenceEnd}
                      </span>
                    </div>
                  </div>

                  <div className="bg-surface-container rounded-lg p-5">
                    <div className="font-label-caps text-[10px] text-on-surface-variant mb-3">
                      MODEL PROVENANCE
                    </div>

                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-on-surface-variant">
                        Source
                      </span>
                      <span className="font-data-mono text-sm text-primary">
                        {prediction.modelSource || 'Unknown'}
                      </span>
                    </div>

                    <div className="flex justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-on-surface-variant">
                        Sequence length
                      </span>
                      <span className="font-data-mono text-sm">
                        {prediction.sequenceLength}
                      </span>
                    </div>

                    <div className="flex justify-between py-2">
                      <span className="text-sm text-on-surface-variant">
                        Mode
                      </span>
                      <span className="font-data-mono text-sm">
                        {prediction.mode}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
};

