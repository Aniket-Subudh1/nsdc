function titleCaseToken(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function sanitizeFileToken(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned ? titleCaseToken(cleaned) : "Learner";
}

export function buildCertificateFileName(fullName: string | null | undefined, sidhCandidateId: string) {
  const firstName = sanitizeFileToken((fullName ?? "").trim().split(/\s+/)[0] || "Learner");
  const candidateNumber = sidhCandidateId.trim().replace(/^CAN_/i, "") || "unknown";
  return `${firstName}_Can_${candidateNumber}.pdf`;
}

export function uniqueCertificateFileName(fileName: string, usedNames: Set<string>) {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }

  const suffix = fileName.toLowerCase().endsWith(".pdf") ? fileName.slice(0, -4) : fileName;
  let index = 2;
  let nextName = `${suffix}_${index}.pdf`;

  while (usedNames.has(nextName)) {
    index += 1;
    nextName = `${suffix}_${index}.pdf`;
  }

  usedNames.add(nextName);
  return nextName;
}
