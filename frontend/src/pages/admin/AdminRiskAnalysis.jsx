import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import socketService from '../../services/socketService';
import { resolveDominantPrediction, TIER_RANK } from '../../utils/dominantHazard';

const DISTRICT_COORDS = {
  Kodagu: {
    lat: '12.4244° N',
    lon: '75.7382° E',
    basin: 'Cauvery & Harangi River Basins',
    terrain: 'Western Ghats Highland Plateau'
  },
  'Uttara Kannada': {
    lat: '14.8153° N',
    lon: '74.6868° E',
    basin: 'Kali, Sharavathi & Aghanashini Coastal Basins',
    terrain: 'Coastal Escarpment & Ghat Ridges'
  },
  Belagavi: {
    lat: '15.8497° N',
    lon: '74.4977° E',
    basin: 'Malaprabha & Krishna River Systems',
    terrain: 'Northern Transition & Ghat Foothills'
  },
  Bagalkot: {
    lat: '16.1850° N',
    lon: '75.6961° E',
    basin: 'Ghataprabha & Krishna Confluences',
    terrain: 'Semi-Arid Lowland River Plain'
  }
};

const TIER_THEME = {
  CRITICAL: {
    badge: 'bg-red-500/15 text-error border-red-500/30',
    dot: 'bg-error',
    border: 'border-error/30',
    glow: 'bg-error/15',
    text: 'text-error'
  },
  HIGH: {
    badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    dot: 'bg-orange-400',
    border: 'border-orange-500/30',
    glow: 'bg-orange-500/15',
    text: 'text-orange-400'
  },
  MODERATE: {
    badge: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    dot: 'bg-yellow-400',
    border: 'border-yellow-500/30',
    glow: 'bg-yellow-500/15',
    text: 'text-yellow-400'
  },
  LOW: {
    badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    dot: 'bg-sky-400',
    border: 'border-sky-500/30',
    glow: 'bg-sky-500/15',
    text: 'text-sky-400'
  }
};

export const AdminRiskAnalysis = () => {
  const [selectedDistrict, setSelectedDistrict] = useState('Kodagu');
  const [floodPred, setFloodPred] = useState(null);
  const [landslidePred, setLandslidePred] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const fetchDistrictRisk = (districtName) => {
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    const token = localStorage.getItem('aegis_token');
    const headers = { Authorization: `Bearer ${token}` };

    // 1. Live Environmental Telemetry
    fetch(`${baseUrl}/environmental/latest?district=${encodeURIComponent(districtName)}`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setTelemetry(data);
      })
      .catch((err) => console.warn('[AdminRiskAnalysis] Telemetry fetch error:', err));

    // 2. Live Flood Prediction
    fetch(`${baseUrl}/predictions/latest?district=${encodeURIComponent(districtName)}&hazard=flood`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.error) setFloodPred(data);
        else setFloodPred(null);
      })
      .catch(() => setFloodPred(null));

    // 3. Live Landslide Prediction (Kodagu & Uttara Kannada)
    if (districtName === 'Kodagu' || districtName === 'Uttara Kannada') {
      fetch(`${baseUrl}/predictions/latest?district=${encodeURIComponent(districtName)}&hazard=landslide`, { headers })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && !data.error) setLandslidePred(data);
          else setLandslidePred(null);
        })
        .catch(() => setLandslidePred(null));
    } else {
      setLandslidePred(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchDistrictRisk(selectedDistrict);

    const unsubPrediction = socketService.onPredictionUpdated((newPred) => {
      if (newPred && newPred.district === selectedDistrict) {
        fetchDistrictRisk(selectedDistrict);
      }
    });

    return () => {
      unsubPrediction();
    };
  }, [selectedDistrict]);

  // Coordinates & Geographic Context
  const geo = DISTRICT_COORDS[selectedDistrict] || {
    lat: '—',
    lon: '—',
    basin: 'Karnataka Basin',
    terrain: 'Plateau'
  };

  // Helper to extract active escalation threshold
  const getEscalationInfo = (hazardPred, currentTier, evalValue) => {
    const t = hazardPred?.thresholds;
    if (t) {
      if (currentTier === 'LOW') {
        const cut = Number(t.moderate);
        return {
          cutoff: cut,
          nextTier: 'Moderate',
          text: `Evaluated: ${evalValue.toFixed(4)} < Moderate cutoff ${cut.toFixed(4)} → LOW (Normal)`
        };
      }
      if (currentTier === 'MODERATE') {
        const cut = Number(t.high);
        const lower = Number(t.moderate);
        return {
          cutoff: cut,
          nextTier: 'High',
          text: `Evaluated: ${evalValue.toFixed(4)} < High cutoff ${cut.toFixed(4)} (≥ ${lower.toFixed(4)} Mod) → MODERATE`
        };
      }
      if (currentTier === 'HIGH') {
        const cut = Number(t.critical);
        const lower = Number(t.high);
        return {
          cutoff: cut,
          nextTier: 'Critical',
          text: `Evaluated: ${evalValue.toFixed(4)} < Critical cutoff ${cut.toFixed(4)} (≥ ${lower.toFixed(4)} High) → HIGH`
        };
      }
      const cut = Number(t.critical);
      return {
        cutoff: cut,
        nextTier: 'Critical',
        text: `Evaluated: ${evalValue.toFixed(4)} ≥ Critical cutoff ${cut.toFixed(4)} → CRITICAL`
      };
    }
    const cut = hazardPred?.nextThreshold !== undefined && hazardPred?.nextThreshold !== null
      ? Number(hazardPred.nextThreshold)
      : (hazardPred?.calibratedThreshold !== undefined && hazardPred?.calibratedThreshold !== null ? Number(hazardPred.calibratedThreshold) : null);
    const nextTier = hazardPred?.nextThresholdTier
      ? hazardPred.nextThresholdTier.charAt(0) + hazardPred.nextThresholdTier.slice(1).toLowerCase()
      : (currentTier === 'LOW' ? 'Moderate' : 'High');
    const op = cut !== null && evalValue >= cut ? '≥' : '<';
    return {
      cutoff: cut,
      nextTier,
      text: cut !== null ? `Evaluated: ${evalValue.toFixed(4)} ${op} Cutoff ${cut.toFixed(4)} → ${currentTier}` : null
    };
  };

  // Flood Metrics
  const floodRaw = floodPred?.rawProbability !== undefined 
    ? floodPred.rawProbability 
    : (floodPred?.riskScore ?? null);
  const floodCalib = floodPred?.calibratedProbability !== undefined && floodPred?.calibratedProbability !== null
    ? floodPred.calibratedProbability
    : (selectedDistrict === 'Belagavi' ? floodRaw : null);
  const floodRiskLevel = floodPred?.riskLevel || 'LOW';
  const floodEvalVal = floodCalib !== null ? floodCalib : (floodRaw !== null ? floodRaw : 0);
  const floodEscalation = floodPred ? getEscalationInfo(floodPred, floodRiskLevel, floodEvalVal) : null;

  // Landslide Metrics
  const lsRaw = landslidePred?.rawProbability !== undefined
    ? landslidePred.rawProbability
    : (landslidePred?.riskScore ?? null);
  const lsCalib = landslidePred?.calibratedProbability !== undefined && landslidePred?.calibratedProbability !== null
    ? landslidePred.calibratedProbability
    : lsRaw;
  const lsRiskLevel = landslidePred?.riskLevel || 'LOW';
  const lsEvalVal = lsCalib !== null ? lsCalib : (lsRaw !== null ? lsRaw : 0);
  const lsEscalation = landslidePred ? getEscalationInfo(landslidePred, lsRiskLevel, lsEvalVal) : null;

  // Peak Calibrated Probability & Overall Risk Tier
  const peakProb = Math.max(floodEvalVal, lsEvalVal);
  const peakPercent = (peakProb * 100).toFixed(1);

  // Canonical dominant hazard resolution (see frontend/src/utils/dominantHazard.js)
  const dominantPrediction = resolveDominantPrediction(floodPred, landslidePred);
  const overallRiskTier = dominantPrediction?.riskLevel || (
    (TIER_RANK[floodRiskLevel] || 1) >= (TIER_RANK[lsRiskLevel] || 1) ? floodRiskLevel : lsRiskLevel
  );
  const overallTheme = TIER_THEME[overallRiskTier] || TIER_THEME.LOW;

  // Formatted Timestamp of Evaluation
  const lastUpdatedTime = floodPred?.updatedAt || floodPred?.createdAt || telemetry?.recordedAt;
  const formattedUpdated = lastUpdatedTime
    ? new Date(lastUpdatedTime).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    : 'Synchronized with live feed';

  // Plain-Language Hazard Drivers (Mission-Control Explanations)
  const getOperationalDriver = () => {
    const reasons = [];
    const rain = telemetry?.rainfall_mm || 0;

    if (rain >= 115.6) {
      reasons.push(`very heavy continuous precipitation (${rain} mm/24h)`);
    } else if (rain >= 64.5) {
      reasons.push(`heavy 24-hour rainfall (${rain} mm)`);
    } else if (rain >= 15.6) {
      reasons.push(`persistent moderate rainfall (${rain} mm)`);
    }

    if (floodRiskLevel === 'CRITICAL') {
      reasons.push('critical river discharge exceeding major flood stage thresholds');
    } else if (floodRiskLevel === 'HIGH') {
      reasons.push('high river water levels nearing bankful stage');
    } else if (floodRiskLevel === 'MODERATE') {
      reasons.push('elevated river discharge in tributary reaches');
    }

    if (selectedDistrict === 'Kodagu' || selectedDistrict === 'Uttara Kannada') {
      if (lsRiskLevel === 'CRITICAL' || lsRiskLevel === 'HIGH') {
        reasons.push('severe hillslope saturation on steep terrain gradients');
      } else if (lsRiskLevel === 'MODERATE') {
        reasons.push('heightened soil moisture along vulnerable slope corridors');
      }
    }

    if (reasons.length > 0) {
      return `Elevated risk is currently driven by ${reasons.join(' combined with ')}.`;
    }

    if (overallRiskTier === 'LOW') {
      return 'All monitored environmental indicators (river discharge, 24h rainfall, and soil moisture) are within normal seasonal baselines. No severe hazard drivers detected.';
    }

    return `Operational status is active under ${overallRiskTier} risk monitoring based on real-time sensor convergence.`;
  };

  // Consultative Operational Considerations (NDMA & KSNDMC Advisory Framework)
  const getOperationalGuidance = () => {
    if (floodPred?.recommendations && floodPred.recommendations.length > 0) {
      return floodPred.recommendations;
    }

    if (overallRiskTier === 'CRITICAL') {
      return [
        'Consider initiating evacuation advisories for low-lying floodplains and unstable slope settlements (NDMA IRS Stage IV / Red Stage).',
        'Evaluate alerting SDRF / NDRF liaison officers and staging search-and-rescue assets near identified vulnerable zones.',
        'Review emergency shelter operational readiness, intake capacities, and backup communication channels.'
      ];
    }
    if (overallRiskTier === 'HIGH') {
      return [
        'Consider issuing targeted safety advisories to residents near river corridors and identified steep terrain (NDMA Stage III / Orange Stage).',
        'Review advisory controls or transit cautions on low-lying culverts, causeways, and landslide-prone ghat roads.',
        'Verify emergency shelter readiness, medical response teams, and civil defence standby status.'
      ];
    }
    if (overallRiskTier === 'MODERATE') {
      return [
        'Consider issuing public precautionary bulletins advising citizens to exercise caution near water bodies and runoff channels (KSNDMC Yellow Stage).',
        'Ensure continuous monitoring of upstream gauge stations, catchment rainfall telemetry, and reservoir releases.',
        'Review local municipal drainage clearance and ensure taluk/district emergency control rooms remain staffed.'
      ];
    }
    return [
      'Maintain standard automated environmental telemetry surveillance and gauge monitoring across district sectors.',
      'Conduct routine communication checks between local emergency operation centers (DEOC) and field stations.',
      'Public advisory status remains at Green / Normal; no emergency operational restrictions indicated.'
    ];
  };

  return (
    <div className="flex-1 h-full overflow-hidden flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-surface/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-headline-md text-xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">query_stats</span>
            Risk Analysis
          </h1>
          <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full border border-primary/30">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
            <span className="font-label-caps text-[10px] text-primary font-bold tracking-wider">
              OPERATIONAL COMMAND
            </span>
          </div>
        </div>

        {/* District Selector Tabs */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-on-surface-variant font-data-mono hidden sm:inline">DISTRICT:</span>
          <div className="flex bg-surface-container p-1 rounded-lg border border-white/10 gap-1">
            {['Kodagu', 'Uttara Kannada', 'Belagavi', 'Bagalkot'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDistrict(d)}
                className={`px-3 py-1 rounded text-xs font-bold font-data-mono transition-all ${
                  selectedDistrict === d
                    ? 'bg-primary text-slate-900 shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* ═══════════════════════════════════════════════════════════════
              TIER 1: PRIMARY VIEW (OPERATIONAL MISSION CONTROL)
              ═══════════════════════════════════════════════════════════════ */}

          {/* 1. Hero Operational Banner */}
          <div className={`glass-panel p-6 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden border ${overallTheme.border}`}>
            <div className={`absolute -right-20 -top-20 w-64 h-64 ${overallTheme.glow} rounded-full blur-3xl pointer-events-none`}></div>
            
            <div className="space-y-2 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${overallTheme.dot} animate-pulse`}></span>
                <span className={`font-label-caps text-xs font-extrabold tracking-widest px-2.5 py-0.5 rounded border ${overallTheme.badge}`}>
                  {overallRiskTier} RISK
                </span>
                <span className="text-xs font-data-mono text-on-surface-variant uppercase tracking-wide">
                  {floodPred?.operationalDecision ? floodPred.operationalDecision.replace(/_/g, ' ') : 'NORMAL MONITORING'}
                </span>
              </div>

              <div>
                <h2 className="font-headline-lg text-3xl font-bold text-on-surface">
                  {selectedDistrict} District
                </h2>
                <p className="text-xs text-on-surface-variant font-mono mt-0.5">
                  Karnataka • {geo.basin}
                </p>
              </div>

              {/* Plain-Language Driver Callout */}
              <div className="p-3 rounded-lg bg-surface-container/70 border border-white/10 text-sm text-on-surface leading-relaxed">
                <span className="font-bold text-primary mr-1.5">What is driving this:</span>
                {getOperationalDriver()}
              </div>

              {/* Freshness & Timestamps */}
              <div className="flex items-center gap-4 text-[11px] font-mono text-outline pt-1">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-primary">update</span>
                  Last evaluated: <strong className="text-on-surface-variant font-normal">{formattedUpdated}</strong>
                </span>
                <span>•</span>
                <span>Automated continuous assessment</span>
              </div>
            </div>

            {/* Prominent Risk Level Metric Box */}
            <div className="flex flex-col items-start md:items-end text-left md:text-right shrink-0 bg-surface-container/50 p-4 rounded-xl border border-white/5">
              <span className="font-label-caps text-[10px] text-on-surface-variant font-bold tracking-wider">
                COMPOSITE HAZARD RISK
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`font-data-mono text-4xl md:text-5xl font-extrabold ${overallTheme.text}`}>
                  {peakPercent}
                </span>
                <span className="text-2xl font-bold text-on-surface-variant/70">%</span>
              </div>
              <span className={`font-label-caps text-[10px] px-2 py-0.5 rounded font-bold mt-2 ${overallTheme.badge}`}>
                {overallRiskTier === 'LOW' ? 'ALL CLEAR' : `${overallRiskTier} ADVISORY`}
              </span>
            </div>
          </div>

          {/* 2. Operational Guidance & Hazard Summary (2 Columns) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Left Card: Actionable Next-Step Guidance */}
            <div className="glass-panel p-5 rounded-xl flex flex-col justify-between gap-4 border border-white/10">
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                  <h3 className="font-label-caps text-xs font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">checklist</span>
                    OPERATIONAL CONSIDERATIONS & GUIDANCE
                  </h3>
                  <span className="text-[10px] font-data-mono text-outline">NDMA / KSNDMC FRAMEWORK</span>
                </div>

                <ul className="space-y-2.5 text-xs text-on-surface">
                  {getOperationalGuidance().map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-container/40 border border-white/5">
                      <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">
                        arrow_right_alt
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-outline font-mono">
                  Prompts aligned with {overallRiskTier} advisory tier
                </span>
                <Link
                  to="/admin/alerts"
                  className="px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">campaign</span>
                  Manage Alerts
                </Link>
              </div>
            </div>

            {/* Right Card: Hazard Overview & Current Ground Conditions */}
            <div className="glass-panel p-5 rounded-xl flex flex-col justify-between gap-4 border border-white/10">
              <div>
                <div className="flex justify-between items-center border-b border-white/10 pb-3 mb-4">
                  <h3 className="font-label-caps text-xs font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-base">dashboard_customize</span>
                    HAZARDS & GROUND CONDITIONS
                  </h3>
                  <span className="text-[10px] font-data-mono text-outline">MONITORED STATUS</span>
                </div>

                {/* Flood Hazard Status */}
                <div className="p-3 rounded-lg bg-surface-container/50 border border-white/5 space-y-2 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-blue-400 text-sm">water_drop</span>
                      River Flood Threat
                    </span>
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                      floodRiskLevel === 'CRITICAL' ? 'bg-red-500/20 text-error border-red-500/30' :
                      floodRiskLevel === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                      floodRiskLevel === 'MODERATE' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                      'bg-sky-500/20 text-sky-400 border-sky-500/30'
                    }`}>
                      {floodRiskLevel} RISK ({(floodEvalVal * 100).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        floodRiskLevel === 'CRITICAL' ? 'bg-error' :
                        floodRiskLevel === 'HIGH' ? 'bg-orange-500' :
                        floodRiskLevel === 'MODERATE' ? 'bg-yellow-400' : 'bg-sky-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(4, floodEvalVal * 100))}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-mono">
                    {floodRiskLevel === 'LOW'
                      ? 'River stages and discharges remain within safe historical ranges.'
                      : 'Heightened discharge active across district drainage channels.'}
                  </p>
                </div>

                {/* Landslide Hazard Status */}
                <div className="p-3 rounded-lg bg-surface-container/50 border border-white/5 space-y-2 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-amber-500 text-sm">landslide</span>
                      Landslide & Slope Threat
                    </span>
                    {selectedDistrict === 'Belagavi' || selectedDistrict === 'Bagalkot' ? (
                      <span className="font-bold text-outline bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px]">
                        NOT APPLICABLE
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                        lsRiskLevel === 'CRITICAL' ? 'bg-red-500/20 text-error border-red-500/30' :
                        lsRiskLevel === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                        lsRiskLevel === 'MODERATE' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                        'bg-sky-500/20 text-sky-400 border-sky-500/30'
                      }`}>
                        {lsRiskLevel} RISK ({(lsEvalVal * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedDistrict === 'Belagavi' || selectedDistrict === 'Bagalkot' ? 'bg-gray-600' :
                        lsRiskLevel === 'CRITICAL' ? 'bg-error' :
                        lsRiskLevel === 'HIGH' ? 'bg-orange-500' :
                        lsRiskLevel === 'MODERATE' ? 'bg-yellow-400' : 'bg-sky-400'
                      }`}
                      style={{ width: `${selectedDistrict === 'Belagavi' || selectedDistrict === 'Bagalkot' ? 0 : Math.min(100, Math.max(4, lsEvalVal * 100))}%` }}
                    ></div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-mono">
                    {selectedDistrict === 'Belagavi' || selectedDistrict === 'Bagalkot'
                      ? 'Non-mountainous alluvial plain; landslide monitoring inactive.'
                      : lsRiskLevel === 'LOW'
                      ? 'Terrain slopes stable; soil moisture within safe geotechnical bounds.'
                      : 'High hillslope saturation detected along escarpment sectors.'}
                  </p>
                </div>

                {/* Observed Telemetry Pills */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-surface-container/60 border border-white/5">
                    <span className="text-outline text-[10px] block">24h Rainfall:</span>
                    <strong className="text-on-surface text-sm">
                      {telemetry?.rainfall_mm !== undefined ? `${telemetry.rainfall_mm} mm` : '—'}
                    </strong>
                    <span className="text-[10px] text-primary block mt-0.5">
                      {(telemetry?.rainfall_mm || 0) >= 64.5 ? 'Heavy' : (telemetry?.rainfall_mm || 0) >= 15.6 ? 'Moderate' : 'Light'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-container/60 border border-white/5">
                    <span className="text-outline text-[10px] block">River Stage:</span>
                    <strong className="text-on-surface text-sm">
                      {telemetry?.river_level_m !== undefined ? `${telemetry.river_level_m} m` : '—'}
                    </strong>
                    <span className="text-[10px] text-secondary block mt-0.5">Primary Gauge</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-container/60 border border-white/5">
                    <span className="text-outline text-[10px] block">Surface Soil Moisture:</span>
                    <strong className="text-on-surface text-sm">
                      {telemetry?.volumetric_sm !== undefined
                        ? `${telemetry.volumetric_sm} m³/m³`
                        : telemetry?.soil_moisture_pct !== undefined
                        ? `${(telemetry.soil_moisture_pct / 100).toFixed(3)} m³/m³`
                        : '—'}
                    </strong>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">0–7cm Layer</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-surface-container/60 border border-white/5">
                    <span className="text-outline text-[10px] block">Atmosphere:</span>
                    <strong className="text-on-surface text-sm">
                      {telemetry?.temperature_c !== undefined ? `${telemetry.temperature_c}°C` : '—'}
                    </strong>
                    <span className="text-[10px] text-on-surface-variant block mt-0.5">
                      {telemetry?.humidity_pct !== undefined ? `${telemetry.humidity_pct}% RH` : 'Normal'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] font-mono text-outline pt-2 border-t border-white/5 flex justify-between">
                <span>Terrain: <strong className="text-on-surface font-normal">{geo.terrain}</strong></span>
                <span>Coordinates: {geo.lat}, {geo.lon}</span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              TIER 2: TECHNICAL DETAILS & AUDIT CONSOLE (SECONDARY / COLLAPSIBLE)
              ═══════════════════════════════════════════════════════════════ */}
          <div className="glass-panel rounded-xl border border-white/10 overflow-hidden transition-all duration-300">
            {/* Collapsible Header Button */}
            <button
              type="button"
              onClick={() => setShowTechnicalDetails((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-xl">developer_mode</span>
                <div>
                  <h3 className="font-label-caps text-xs font-bold text-on-surface flex items-center gap-2">
                    TECHNICAL AUDIT & MODEL DETAILS
                    <span className="text-[10px] text-primary font-mono font-normal bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                      ML Microservice & Sensors
                    </span>
                  </h3>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Model versions, raw vs calibrated probabilities, escalation thresholds, and sensor provenance
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-primary font-bold">
                <span>{showTechnicalDetails ? 'Collapse Console' : 'Expand Full Audit'}</span>
                <span className="material-symbols-outlined text-base transition-transform duration-200" style={{ transform: showTechnicalDetails ? 'rotate(180deg)' : 'none' }}>
                  expand_more
                </span>
              </div>
            </button>

            {/* Collapsible Technical Content */}
            {showTechnicalDetails && (
              <div className="p-6 border-t border-white/10 bg-black/40 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* 1. Flood Model Specification & Probability Matrix */}
                  <div className="bg-surface-container/60 p-4 rounded-xl border border-white/5 space-y-3 font-mono">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase text-on-surface flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-400 text-sm">water_drop</span>
                        Flood Model Specification
                      </span>
                      <span className="text-[10px] text-outline">15-Day Lookback Sequence</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center bg-black/40 p-2.5 rounded-lg border border-white/5 divide-x divide-white/5">
                      <div>
                        <span className="text-[9px] text-outline font-semibold uppercase block">
                          {selectedDistrict === 'Belagavi' ? 'Physical RF' : 'Raw LSTM'}
                        </span>
                        <span className="font-bold text-on-surface text-sm font-mono mt-0.5 block">
                          {floodRaw !== null ? floodRaw.toFixed(4) : '—'}
                        </span>
                        <span className="text-[8px] text-outline block">Raw Output</span>
                      </div>
                      <div className="bg-yellow-500/10 rounded border border-yellow-500/20 py-0.5">
                        <span className="text-yellow-400 text-[9px] font-bold uppercase block">Calibrated P</span>
                        <span className="font-extrabold text-yellow-300 text-sm font-mono mt-0.5 block">
                          {floodCalib !== null ? floodCalib.toFixed(4) : (floodRaw !== null ? floodRaw.toFixed(4) : '—')}
                        </span>
                        <span className="text-[8px] text-yellow-500/80 font-bold block">Evaluated</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-outline font-semibold uppercase block">Next Cutoff</span>
                        <span className="font-bold text-error text-sm font-mono mt-0.5 block">
                          {floodEscalation?.cutoff !== null ? Number(floodEscalation.cutoff).toFixed(4) : '—'}
                        </span>
                        <span className="text-[8px] text-outline block">To {floodEscalation?.nextTier || 'Tier'}</span>
                      </div>
                    </div>

                    {floodEscalation?.text && (
                      <div className="text-[10px] text-on-surface-variant bg-black/50 px-2.5 py-1.5 rounded border border-white/5">
                        {floodEscalation.text}
                      </div>
                    )}

                    <div className="text-[10px] text-outline pt-2 border-t border-white/5 space-y-1">
                      <div className="flex justify-between">
                        <span>Model Architecture:</span>
                        <span className="text-on-surface font-semibold">
                          {selectedDistrict === 'Belagavi' ? 'Secondary Physical Random Forest (26 features)' : 'Frozen M11 LSTM (Level 2 Calibration)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Calibration Method:</span>
                        <span className="text-on-surface font-semibold">Empirical Youden J Optimization (1,461-day validation set)</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Landslide Model Specification & Probability Matrix */}
                  <div className="bg-surface-container/60 p-4 rounded-xl border border-white/5 space-y-3 font-mono">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase text-on-surface flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-amber-500 text-sm">landslide</span>
                        Landslide Model Specification
                      </span>
                      <span className="text-[10px] text-outline">30-Day Lookback Sequence</span>
                    </div>

                    {selectedDistrict === 'Belagavi' || selectedDistrict === 'Bagalkot' ? (
                      <div className="py-6 text-center text-xs text-on-surface-variant italic bg-black/30 rounded-lg border border-white/5">
                        Landslide LSTM sequence evaluation inactive for non-mountainous alluvial basin.
                      </div>
                    ) : landslidePred ? (
                      <>
                        <div className="grid grid-cols-3 gap-1.5 text-center bg-black/40 p-2.5 rounded-lg border border-white/5 divide-x divide-white/5">
                          <div>
                            <span className="text-[9px] text-outline font-semibold uppercase block">Raw LSTM</span>
                            <span className="font-bold text-on-surface text-sm font-mono mt-0.5 block">
                              {lsRaw !== null ? lsRaw.toFixed(4) : '—'}
                            </span>
                            <span className="text-[8px] text-outline block">Raw Output</span>
                          </div>
                          <div className="bg-yellow-500/10 rounded border border-yellow-500/20 py-0.5">
                            <span className="text-yellow-400 text-[9px] font-bold uppercase block">Calibrated P</span>
                            <span className="font-extrabold text-yellow-300 text-sm font-mono mt-0.5 block">
                              {lsCalib !== null ? lsCalib.toFixed(4) : '—'}
                            </span>
                            <span className="text-[8px] text-yellow-500/80 font-bold block">Evaluated</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-outline font-semibold uppercase block">Next Cutoff</span>
                            <span className="font-bold text-amber-400 text-sm font-mono mt-0.5 block">
                              {lsEscalation?.cutoff !== null ? Number(lsEscalation.cutoff).toFixed(4) : '—'}
                            </span>
                            <span className="text-[8px] text-outline block">To {lsEscalation?.nextTier || 'Tier'}</span>
                          </div>
                        </div>

                        {lsEscalation?.text && (
                          <div className="text-[10px] text-on-surface-variant bg-black/50 px-2.5 py-1.5 rounded border border-white/5">
                            {lsEscalation.text}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="py-4 text-center text-xs text-on-surface-variant italic">
                        No landslide prediction record available.
                      </div>
                    )}

                    <div className="text-[10px] text-outline pt-2 border-t border-white/5 space-y-1">
                      <div className="flex justify-between">
                        <span>Model Architecture:</span>
                        <span className="text-on-surface font-semibold">Frozen M11 LSTM (30-day temporal tensor)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sensor Integration:</span>
                        <span className="text-on-surface font-semibold">NASA SMAP L4 Causal Soil Water Content</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Sensor & Telemetry Provenance Row */}
                <div className="p-4 rounded-xl bg-surface-container/40 border border-white/5 font-mono text-xs text-outline space-y-2">
                  <div className="font-bold text-on-surface text-[11px] uppercase tracking-wider mb-2">
                    SENSOR TELEMETRY PROVENANCE & INGESTION DETAILS
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="block text-[10px] text-outline">Rainfall Engine:</span>
                      <span className="text-on-surface">Open-Meteo NWP · IMD Standard Classification</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-outline">River Discharge Engine:</span>
                      <span className="text-on-surface">ECMWF GloFAS v4.0 (z-score rescaled, σ_eff floor)</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-outline">Soil Moisture Engine:</span>
                      <span className="text-on-surface">NASA SMAP L4 (SPL4SMGP v8) 0–7cm Volumetric θ</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/5 flex flex-wrap justify-between text-[10px]">
                    <span>Centroid: {geo.lat}, {geo.lon}</span>
                    <span>Basin: {geo.basin}</span>
                    <span>Provider Source: {telemetry?.source || 'NASA / GloFAS / Open-Meteo'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};
