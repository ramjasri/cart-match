// src/utils/earlyReferral.js
// Community-oncology decision engine.
//
// Output is decision-focused (REFER NOW / REFER AT PROGRESSION /
// MONITOR / NOT INDICATED) rather than the eligibility-focused output
// of the main score() engine. Designed for the community oncologist
// who hasn't yet decided to refer — answers "should I?" not "to what?"

function classify(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("myeloma")) return "mm";
  if (c.includes("mantle") || c.includes("mcl")) return "mcl";
  if (c.includes("cll") || c.includes("sll")) return "cll";
  if (c.includes("follicular")) return "fl";
  if (c.includes("all") || c.includes("leukemia")) return "all";
  if (c.includes("dlbcl") || c.includes("lbcl") || c.includes("lymphoma") || c.includes("large b")) return "dlbcl";
  return null;
}

export function calculateReferralDecision(pt) {
  const triggers = [];
  const actions = [];
  let urgency = 0;
  let missedWindow = false;

  const cancer = classify(pt.cancerType);
  const lines = parseInt(pt.priorLines, 10) || 0;
  const ecog  = parseInt(pt.ecog, 10) || 0;
  const response = pt.latestResponse;

  if (!cancer) {
    return {
      decision: "INSUFFICIENT_DATA",
      urgency: 0,
      headline: "Select a cancer type to evaluate",
      sub: "",
      triggers: [], actions: [], missedWindow: false,
    };
  }

  // ─── DLBCL / LBCL ─────────────────────────────────────────────────────────
  if (cancer === "dlbcl") {
    if (pt.primaryRefractory || response === "primary_refractory") {
      urgency = 10;
      triggers.push("Primary refractory DLBCL — no response to first-line R-CHOP");
      actions.push("Identify nearest FACT-accredited CAR-T center today (Yescarta or Breyanzi at 2L)");
      actions.push("Order CD19 IHC on the diagnostic biopsy specimen if not already done");
      actions.push("Do NOT start salvage chemo before specialist consultation — CAR-T is preferred at 2L per NCCN Cat 1");
    }
    if (pt.earlyRelapse) {
      urgency = Math.max(urgency, 10);
      triggers.push("Early relapse (<12 months from completion of 1L immunochemo)");
      if (!actions.some(a => a.includes("FACT-accredited"))) {
        actions.push("Refer to FACT-accredited CAR-T center — auto-SCT is NOT preferred in this scenario per NCCN");
      }
    }
    if (pt.doubleHit) {
      urgency = Math.max(urgency, 9);
      triggers.push("Double/triple-hit lymphoma (MYC + BCL2 ± BCL6)");
      actions.push("Bypass salvage chemo + auto-SCT — these have poor outcomes in double-hit; refer for 2L CAR-T directly");
    }
    if (lines >= 2 && (response === "pd" || response === "sd")) {
      urgency = Math.max(urgency, 9);
      triggers.push(`DLBCL progressing despite ${lines} prior lines`);
      if (lines >= 3) {
        missedWindow = true;
        triggers.push("⚠ MISSED WINDOW — patient should have been referred after 2nd-line failure, ~3 months ago");
      }
    }
    if (lines >= 1 && response === "cr") {
      urgency = Math.max(urgency, 2);
      triggers.push(`Complete response on ${lines === 1 ? "1L" : `${lines}L`} — continue current management, monitor closely`);
      actions.push("Watch for progression on surveillance imaging — refer immediately at recurrence");
    }
  }

  // ─── Follicular lymphoma ──────────────────────────────────────────────────
  if (cancer === "fl") {
    if (pt.pod24) {
      urgency = Math.max(urgency, 9);
      triggers.push("POD24 — progression within 24 months of 1L immunochemo (poor-prognosis FL)");
      actions.push("Refer for CAR-T or bispecific evaluation — re-treatment with chemoimmunotherapy is inadequate");
    }
    if (pt.flGrade3b) {
      urgency = Math.max(urgency, 8);
      triggers.push("Grade 3B FL — treat per DLBCL pathway, not FL pathway");
      actions.push("Use DLBCL referral logic — Yescarta or Breyanzi at 2L+");
    }
    if (pt.transformedToDlbcl) {
      urgency = Math.max(urgency, 9);
      triggers.push("Histologic transformation to DLBCL");
      actions.push("Refer for 2L CAR-T per DLBCL pathway — prior FL lines don't count toward DLBCL line threshold");
    }
    if (lines >= 3 && !pt.pod24 && !pt.flGrade3b) {
      urgency = Math.max(urgency, 8);
      triggers.push(`FL at 3L+ — CAR-T (Yescarta, Breyanzi, Kymriah) and bispecifics (Lunsumio at 2L+, Epkinly at 3L+) approved`);
    }
  }

  // ─── MCL ──────────────────────────────────────────────────────────────────
  if (cancer === "mcl") {
    if (pt.btkiRefractory) {
      urgency = 10;
      triggers.push("BTK inhibitor–refractory MCL — limited remaining options, short median survival");
      actions.push("Refer urgently for Tecartus (ZUMA-2) — post-BTKi survival without CAR-T is poor");
    } else if (pt.btkiExposed && (response === "pd" || response === "sd")) {
      urgency = Math.max(urgency, 9);
      triggers.push("MCL progressing on BTK inhibitor");
      actions.push("Refer for Tecartus before next progression — don't delay through salvage chemo");
    } else if (pt.btkiExposed) {
      urgency = Math.max(urgency, 6);
      triggers.push("MCL on BTK inhibitor — monitor closely for failure");
      actions.push("Identify a CAR-T center now while patient is still responding — refer immediately at progression");
    }
    if (pt.blastoidVariant) {
      urgency = Math.max(urgency, 9);
      triggers.push("Blastoid / pleomorphic MCL variant — aggressive biology");
    }
    if (pt.tp53Mutated) {
      urgency = Math.max(urgency, 9);
      triggers.push("TP53-mutated MCL — poor chemoimmunotherapy response, BTKi failure likely");
      actions.push("Don't rely on standard chemoimmunotherapy — refer for CAR-T early");
    }
  }

  // ─── CLL ──────────────────────────────────────────────────────────────────
  if (cancer === "cll") {
    if (pt.richtersTransformation) {
      urgency = 10;
      triggers.push("Richter's transformation — treat per DLBCL pathway");
      actions.push("Refer urgently — DLBCL-style CAR-T (Yescarta, Breyanzi) is the preferred consolidative approach");
    } else if (pt.btkiVenetoclaxExposed) {
      urgency = Math.max(urgency, 9);
      triggers.push("CLL/SLL after BTKi AND venetoclax exposure — eligible for Breyanzi (TRANSCEND CLL 004)");
      actions.push("Refer for Breyanzi evaluation");
    } else if (pt.btkiExposed) {
      urgency = Math.max(urgency, 4);
      triggers.push("CLL on or after BTK inhibitor — venetoclax is typically the next line; CAR-T after both");
    }
  }

  // ─── ALL ──────────────────────────────────────────────────────────────────
  if (cancer === "all") {
    // R/R B-ALL is inherently urgent
    if (lines >= 1) {
      urgency = Math.max(urgency, 9);
      triggers.push("R/R B-ALL — disease tempo is inherently rapid");
      if (pt.age25OrYounger) {
        actions.push("Refer for Kymriah (ELIANA) — only CAR-T approved in patients ≤25 years");
      } else {
        actions.push("Refer for Tecartus (ZUMA-3) — adult R/R B-ALL");
      }
      actions.push("Consider blinatumomab or inotuzumab as a bridge while CAR-T manufacturing is in process");
    }
    if (pt.phPositive) {
      actions.push("Continue TKI through apheresis and resume after CAR-T per institutional protocol");
    }
  }

  // ─── MM ───────────────────────────────────────────────────────────────────
  if (cancer === "mm") {
    const tripleClass = pt.priorImid && pt.priorPi && pt.priorAntiCd38;

    if (pt.lenalidomideRefractory && lines >= 1) {
      urgency = Math.max(urgency, 9);
      triggers.push("Lenalidomide-refractory MM with ≥1 prior line — Carvykti now approved at 1L+ (CARTITUDE-4)");
      actions.push("This is a NEW indication most community oncologists haven't operationalized yet — refer for Carvykti evaluation now");
    }
    if (tripleClass && lines >= 4) {
      urgency = Math.max(urgency, 10);
      triggers.push(`Triple-class exposed MM with ${lines} prior lines`);
      actions.push("Full CAR-T and bispecific access available — refer for Abecma, Carvykti, Tecvayli, Talvey, or Elrexfio");
    } else if (tripleClass && lines >= 3) {
      urgency = Math.max(urgency, 8);
      triggers.push("Triple-class exposed at 3L — CAR-T and bispecific eligibility opens at 4L");
      actions.push("Identify a CAR-T center and confirm IMiD/PI/anti-CD38 exposures via outside records now — refer at next progression");
    }
    if (pt.extramedullaryDisease) {
      urgency = Math.max(urgency, 9);
      triggers.push("Extramedullary disease (EMD) — adverse marker for BCMA-directed therapy");
      actions.push("Consider GPRC5D-directed bispecific (Talvey) sequencing if BCMA fails");
    }
    if (lines >= 5 && tripleClass && !pt.everReferredForCarT) {
      missedWindow = true;
      triggers.push(`⚠ MISSED WINDOW — triple-class exposed with ${lines} prior lines and never referred. Eligibility opened at 4L (~6 months ago typical)`);
    }
  }

  // ─── Cross-cutting performance / tempo signals ────────────────────────────
  if (ecog >= 3 && lines >= 2) {
    urgency = Math.max(urgency, 7);
    triggers.push(`Declining performance status (ECOG ${ecog}) — referral window narrowing`);
    actions.push("Don't wait — referral evaluation requires adequate performance status; act before further decline");
  }
  if (pt.diseaseTempo === "rapid" && lines >= 1) {
    urgency = Math.max(urgency, 8);
    triggers.push("Rapidly progressive disease — short window to specialist evaluation");
  }

  // ─── Determine decision ──────────────────────────────────────────────────
  let decision, headline, sub, color;
  if (urgency >= 8) {
    decision = "REFER_NOW";
    headline = "Refer now";
    sub = "This patient should be referred for immediate cell therapy evaluation. Time matters.";
    color = "#b54a2c";
  } else if (urgency >= 5) {
    decision = "REFER_AT_PROGRESSION";
    headline = "Refer at next progression";
    sub = "Patient is approaching the referral window. Identify a CAR-T center now; refer immediately at next progression.";
    color = "#c4a661";
  } else if (urgency >= 2) {
    decision = "MONITOR";
    headline = "Monitor — referral not yet indicated";
    sub = "Current line is appropriate. Watch for early signals that should trigger referral.";
    color = "#4c6b8c";
  } else {
    decision = "NOT_INDICATED";
    headline = "Cell therapy not currently indicated";
    sub = "Continue standard-of-care management. Re-evaluate at progression or treatment failure.";
    color = "#5a7a4a";
  }

  // Generic "what to do today" if none specified yet
  if (actions.length === 0) {
    if (decision === "REFER_NOW") {
      actions.push("Identify a FACT-accredited CAR-T center near you");
      actions.push("Send patient records (path report, imaging, treatment history) to the specialist");
      actions.push("Initiate insurance prior authorization");
    } else if (decision === "REFER_AT_PROGRESSION") {
      actions.push("Identify the nearest CAR-T-capable center — don't wait until you need one");
      actions.push("Document target marker status (CD19, BCMA, CD20) on the most recent biopsy");
      actions.push("Maintain organ function — avoid renal/hepatotoxic agents that could disqualify later");
    } else if (decision === "MONITOR") {
      actions.push("Continue planned therapy");
      actions.push("Watch for: rapid progression, performance decline, failure to achieve response");
    }
  }

  return {
    decision, urgency, headline, sub, color,
    triggers, actions, missedWindow,
    cancer,
  };
}
