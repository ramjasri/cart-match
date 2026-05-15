// src/components/TrialsPanel.jsx
// Fetches and displays live recruiting trials from ClinicalTrials.gov v2 API

import { useState, useEffect } from "react";
import { ExternalLink, Loader2, AlertCircle } from "lucide-react";

const CT_BASE = "https://clinicaltrials.gov/api/v2/studies";

async function fetchTrials(genericName) {
  const params = new URLSearchParams({
    "query.term": genericName,
    "filter.overallStatus": "RECRUITING",
    "pageSize": "6",
    "format": "json",
    "fields": "NCTId|BriefTitle|OverallStatus|Phase|LeadSponsorName|EnrollmentCount|LocationCity|LocationState|LocationCountry|LocationFacility",
  });
  const res = await fetch(`${CT_BASE}?${params}`);
  if (!res.ok) throw new Error(`CT.gov ${res.status}`);
  const data = await res.json();
  return (data.studies ?? []).map(s => {
    const id   = s.protocolSection?.identificationModule ?? {};
    const stat = s.protocolSection?.statusModule ?? {};
    const des  = s.protocolSection?.designModule ?? {};
    const spon = s.protocolSection?.sponsorCollaboratorsModule ?? {};
    const locs = s.protocolSection?.contactsLocationsModule?.locations ?? [];
    const phases = (des.phases ?? []).map(p => p.replace("PHASE", "").replace(/_/g, "")).join("/");

    const topLocs = locs
      .slice(0, 3)
      .map(l => [l.city, l.state, l.country].filter(Boolean).join(", "));

    return {
      nctId:      id.nctId,
      title:      id.briefTitle || "Untitled",
      status:     (stat.overallStatus || "").replace(/_/g, " "),
      phase:      phases || "N/A",
      sponsor:    spon.leadSponsor?.name || "—",
      enrollment: des.enrollmentInfo?.count ?? null,
      locations:  topLocs,
      url:        `https://clinicaltrials.gov/study/${id.nctId}`,
    };
  });
}

const trialsCSS = `
  .tp-root { margin-top: 18px; }
  .tp-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
  }
  .tp-live-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #5a7a4a;
    animation: tp-pulse 2s ease-in-out infinite;
  }
  @keyframes tp-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
  .tp-loading {
    display: flex; align-items: center; gap: 8px;
    font-family: 'Inter Tight', sans-serif; font-size: 12px; color: #6b645a;
    padding: 10px 0;
  }
  .tp-error {
    display: flex; align-items: center; gap: 8px;
    font-family: 'Inter Tight', sans-serif; font-size: 12px; color: #b54a2c;
    padding: 8px 0;
  }
  .tp-empty {
    font-family: 'Inter Tight', sans-serif; font-size: 12px; color: #6b645a;
    padding: 8px 0; font-style: italic;
  }
  .tp-list { display: flex; flex-direction: column; gap: 8px; }
  .tp-card {
    border: 1px solid #1a181520; background: #f4f1ea; padding: 10px 12px;
  }
  .tp-card-top {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
    margin-bottom: 4px;
  }
  .tp-nct {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #4c6b8c; text-decoration: none; letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .tp-nct:hover { text-decoration: underline; }
  .tp-phase {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #6b645a; border: 1px solid #1a181525; padding: 2px 6px;
    flex-shrink: 0;
  }
  .tp-title {
    font-family: 'Inter Tight', sans-serif; font-size: 12px; color: #1a1815;
    line-height: 1.4; margin-bottom: 5px;
  }
  .tp-meta {
    display: flex; gap: 14px; flex-wrap: wrap;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #6b645a;
  }
  .tp-locs {
    font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #6b645a;
    margin-top: 4px; line-height: 1.5;
  }
  .tp-more {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #4c6b8c; text-decoration: none; text-transform: uppercase;
    letter-spacing: 0.1em; display: inline-flex; align-items: center; gap: 4px;
    margin-top: 6px;
  }
  .tp-more:hover { text-decoration: underline; }
`;

export default function TrialsPanel({ genericName, nctSearch }) {
  const [trials, setTrials] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTrials(genericName)
      .then(data => { if (!cancelled) { setTrials(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [genericName]);

  const allTrialsUrl = `https://clinicaltrials.gov/search?term=${nctSearch}&recrs=a`;

  return (
    <>
      <style>{trialsCSS}</style>
      <div className="tp-root">
        <div className="tp-head">
          <div className="tp-live-dot" />
          Recruiting trials — live from ClinicalTrials.gov
        </div>

        {loading && (
          <div className="tp-loading">
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
            Fetching from ClinicalTrials.gov…
          </div>
        )}
        {error && (
          <div className="tp-error">
            <AlertCircle size={13} />
            Could not load trials — <a href={allTrialsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4c6b8c" }}>search manually</a>
          </div>
        )}
        {trials && trials.length === 0 && (
          <p className="tp-empty">No recruiting trials found for {genericName}.</p>
        )}
        {trials && trials.length > 0 && (
          <>
            <div className="tp-list">
              {trials.map(t => (
                <div key={t.nctId} className="tp-card">
                  <div className="tp-card-top">
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="tp-nct">
                      {t.nctId}
                    </a>
                    <span className="tp-phase">Phase {t.phase}</span>
                  </div>
                  <div className="tp-title">{t.title}</div>
                  <div className="tp-meta">
                    <span>{t.sponsor}</span>
                    {t.enrollment && <span>n={t.enrollment}</span>}
                  </div>
                  {t.locations.length > 0 && (
                    <div className="tp-locs">📍 {t.locations.join(" · ")}</div>
                  )}
                </div>
              ))}
            </div>
            <a href={allTrialsUrl} target="_blank" rel="noopener noreferrer" className="tp-more">
              <ExternalLink size={10} />
              All recruiting trials on ClinicalTrials.gov
            </a>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
