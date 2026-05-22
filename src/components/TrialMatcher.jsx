// src/components/TrialMatcher.jsx
// Patient-level trial matcher panel — appears in results when products exist.
// Auto-refetches when the patient profile changes.

import { useState, useEffect } from "react";
import { ExternalLink, Loader2, AlertCircle, FlaskConical } from "lucide-react";
import { fetchMatchingTrials } from "../utils/trialMatcher.js";

const matcherCSS = `
  .tm-panel {
    border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 20px;
    overflow: hidden;
  }
  .tm-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; background: #4c6b8c; color: #f4f1ea;
  }
  .tm-icon-bg {
    width: 30px; height: 30px; background: #1a1815; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .tm-hdr-text { flex: 1; min-width: 0; }
  .tm-hdr-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; line-height: 1;
  }
  .tm-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: #c4a661; margin-top: 4px;
  }
  .tm-count {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    background: #1a1815; color: #c4a661;
    padding: 4px 10px; letter-spacing: 0.15em; text-transform: uppercase;
    flex-shrink: 0;
  }
  .tm-body { padding: 16px 18px; }

  .tm-status {
    display: flex; align-items: center; gap: 9px;
    font-family: 'Inter Tight', sans-serif; font-size: 13px;
    padding: 10px 0; color: #6b645a;
  }
  .tm-status.error { color: #b54a2c; }

  .tm-trial {
    background: #ebe6dc; border: 1px solid #1a181520;
    padding: 12px 14px; margin-bottom: 8px;
  }
  .tm-trial:last-of-type { margin-bottom: 0; }
  .tm-trial-top {
    display: flex; align-items: center; gap: 10px; margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .tm-trial-nct {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #4c6b8c; text-decoration: none; letter-spacing: 0.06em;
  }
  .tm-trial-nct:hover { text-decoration: underline; }
  .tm-trial-phase {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #6b645a; border: 1px solid #1a181525; padding: 2px 6px;
  }
  .tm-trial-title {
    font-family: 'Inter Tight', sans-serif; font-size: 13px;
    color: #1a1815; line-height: 1.4; margin: 5px 0 7px;
  }
  .tm-trial-meta {
    display: flex; flex-wrap: wrap; gap: 14px;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #6b645a;
    margin-bottom: 6px;
  }
  .tm-trial-locs {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #6b645a;
    margin-top: 4px; line-height: 1.55;
  }
  .tm-trial-tags {
    display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;
  }
  .tm-trial-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    text-transform: uppercase; letter-spacing: 0.1em;
    padding: 2.5px 7px; color: #4c6b8c;
    border: 1px solid #4c6b8c40; background: #4c6b8c08;
  }
  .tm-trial-tag.match {
    color: #4a6a3a; border-color: #5a7a4a55; background: #5a7a4a10;
  }
  .tm-more {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #4c6b8c; text-decoration: none; text-transform: uppercase;
    letter-spacing: 0.12em; margin-top: 14px; padding: 8px 14px;
    border: 1px solid #4c6b8c40;
  }
  .tm-more:hover { background: #4c6b8c0d; }
  @keyframes tm-spin { to { transform: rotate(360deg); } }
`;

export default function TrialMatcher({ pt, ineligibleCount, totalProducts }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMatchingTrials(pt)
      .then(data => { if (!cancelled) { setResult(data); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [pt.cancerType, pt.cd19, pt.cd20, pt.bcma, pt.gprc5d, pt.priorLines]);

  const trials = result?.trials ?? [];
  const noneEligible = ineligibleCount === totalProducts;

  const headline = noneEligible
    ? "Approved products limited — explore these trials"
    : "Recruiting trials matching this profile";
  const sub = noneEligible
    ? "Zero approved products eligible · investigational options available"
    : "Patient-level match · CT.gov v2 · live recruiting filter";

  return (
    <>
      <style>{matcherCSS}</style>
      <div className="tm-panel">
        <div className="tm-hdr">
          <div className="tm-icon-bg"><FlaskConical size={16} strokeWidth={1.6} /></div>
          <div className="tm-hdr-text">
            <div className="tm-hdr-title">{headline}</div>
            <div className="tm-hdr-sub">{sub}</div>
          </div>
          {!loading && !error && trials.length > 0 && (
            <div className="tm-count">{trials.length} matched</div>
          )}
        </div>

        <div className="tm-body">
          {loading && (
            <div className="tm-status">
              <Loader2 size={14} style={{ animation: "tm-spin 1s linear infinite" }} />
              Searching ClinicalTrials.gov for recruiting trials matching this profile…
            </div>
          )}

          {error && (
            <div className="tm-status error">
              <AlertCircle size={14} />
              Could not load trials ({error}). Try <a href={result?.searchUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4c6b8c" }}>searching directly</a>.
            </div>
          )}

          {!loading && !error && trials.length === 0 && (
            <div className="tm-status">
              No recruiting trials matched the patient profile in the top 30 results — search manually for broader options.
            </div>
          )}

          {!loading && !error && trials.length > 0 && (
            <>
              {trials.map(t => (
                <div key={t.nctId} className="tm-trial">
                  <div className="tm-trial-top">
                    <a href={t.url} target="_blank" rel="noopener noreferrer" className="tm-trial-nct">
                      {t.nctId}
                    </a>
                    <span className="tm-trial-phase">Phase {t.phase}</span>
                  </div>
                  <div className="tm-trial-title">{t.title}</div>
                  <div className="tm-trial-meta">
                    <span>{t.sponsor}</span>
                    {t.enrollment && <span>n={t.enrollment}</span>}
                    {t.locationCount > 0 && <span>{t.locationCount} site{t.locationCount === 1 ? "" : "s"}</span>}
                  </div>
                  {t.locations.length > 0 && (
                    <div className="tm-trial-locs">📍 {t.locations.join(" · ")}</div>
                  )}
                  {t.tags.length > 0 && (
                    <div className="tm-trial-tags">
                      {t.tags.map((tag, i) => (
                        <span
                          key={i}
                          className={`tm-trial-tag${tag.startsWith("✓") ? " match" : ""}`}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {result.searchUrl && (
                <a href={result.searchUrl} target="_blank" rel="noopener noreferrer" className="tm-more">
                  <ExternalLink size={10} />
                  All recruiting trials for {result.query} ({result.totalFound}+)
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
