import { describe, expect, it } from "vitest";

import { buildCertificateFileName, uniqueCertificateFileName } from "@/lib/certificate-file-name";

describe("certificate file names", () => {
  it("uses first name plus Can and the SIDH candidate number", () => {
    expect(buildCertificateFileName("Aniket Kumar", "CAN_41422")).toBe("Aniket_Can_41422.pdf");
    expect(buildCertificateFileName("Rupa Karji", "CAN_40911229")).toBe("Rupa_Can_40911229.pdf");
  });

  it("title-cases the first name and falls back when the name is missing", () => {
    expect(buildCertificateFileName("ANIKET", "41422")).toBe("Aniket_Can_41422.pdf");
    expect(buildCertificateFileName(null, "CAN_41422")).toBe("Learner_Can_41422.pdf");
  });

  it("keeps duplicate names unique inside a zip", () => {
    const usedNames = new Set<string>();
    expect(uniqueCertificateFileName("Aniket_Can_41422.pdf", usedNames)).toBe("Aniket_Can_41422.pdf");
    expect(uniqueCertificateFileName("Aniket_Can_41422.pdf", usedNames)).toBe("Aniket_Can_41422_2.pdf");
  });
});
