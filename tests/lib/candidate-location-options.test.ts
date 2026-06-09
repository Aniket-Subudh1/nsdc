import { describe, expect, it } from "vitest";

import {
  CANDIDATE_STATE_OPTIONS,
  isKnownCandidateDistrictForState,
  isKnownCandidateState,
  listCandidateDistrictsForState,
  normalizeCandidateDistrict,
  normalizeCandidateState,
  resolveCandidateDistrict,
} from "@/lib/candidate-location-options";

describe("candidate location options", () => {
  it("includes only SIDH LGD states from the bulk upload template", () => {
    expect(CANDIDATE_STATE_OPTIONS).toContain("ODISHA");
    expect(CANDIDATE_STATE_OPTIONS).toContain("ANDHRA PRADESH");
    expect(CANDIDATE_STATE_OPTIONS).not.toContain("Type Of ID");
    expect(CANDIDATE_STATE_OPTIONS).not.toContain("yesno");
    expect(CANDIDATE_STATE_OPTIONS).toHaveLength(37);
  });

  it("normalizes state and district spellings to canonical LGD values", () => {
    expect(normalizeCandidateState("odisha")).toBe("ODISHA");
    expect(normalizeCandidateState("ANDHRAPRADESH")).toBe("ANDHRA PRADESH");
    expect(normalizeCandidateDistrict("ODISHA", "cuttack")).toBe("CUTTACK");
    expect(resolveCandidateDistrict("ANDHRA PRADESH", "Y S R")).toBe("Y.S.R.");
  });

  it("lists districts only for the selected state", () => {
    const odishaDistricts = listCandidateDistrictsForState("ODISHA");
    expect(odishaDistricts).toContain("CUTTACK");
    expect(odishaDistricts).not.toContain("NEW DELHI");
  });

  it("validates known state and district pairs strictly", () => {
    expect(isKnownCandidateState("ODISHA")).toBe(true);
    expect(isKnownCandidateState("Odisha")).toBe(true);
    expect(isKnownCandidateState("Atlantis")).toBe(false);
    expect(isKnownCandidateDistrictForState("ODISHA", "CUTTACK")).toBe(true);
    expect(isKnownCandidateDistrictForState("ODISHA", "NEW DELHI")).toBe(false);
    expect(isKnownCandidateDistrictForState("ODISHA", "Cuttack ")).toBe(true);
    expect(normalizeCandidateDistrict("ODISHA", "INVALID DISTRICT")).toBe("");
  });
});
