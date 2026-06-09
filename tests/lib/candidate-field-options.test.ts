import { describe, expect, it } from "vitest";

import {
  normalizeCandidateGender,
  normalizeCandidateNamePrefix,
} from "@/lib/candidate-field-options";

describe("candidate field options", () => {
  it("normalizes name prefix case-insensitively", () => {
    expect(normalizeCandidateNamePrefix("mr")).toBe("Mr");
    expect(normalizeCandidateNamePrefix("MX")).toBe("Mx");
    expect(normalizeCandidateNamePrefix("")).toBe("");
  });

  it("normalizes gender case-insensitively", () => {
    expect(normalizeCandidateGender("female")).toBe("Female");
    expect(normalizeCandidateGender("TRANSGENDER")).toBe("Transgender");
  });
});
