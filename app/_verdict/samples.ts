"use client";

import { useCallback, useState } from "react";
import type { Intake } from "./use-intake";
import { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor, type SampleCard, type SampleJob } from "./sample-data";
import reads from "./sample-reads.json";

export { SAMPLE_CARDS, SAMPLE_JOBS, sampleJobFor };
export type { SampleCard, SampleJob };

/**
 * Sample cards ship with their titles already read, so a pick is instant. A
 * sample without a stored read falls back to the upload path.
 */
export function usePickSample(intake: Intake) {
  const { addFile, addKnown, setHandle } = intake;
  const [picked, setPicked] = useState<string | null>(null);

  const pick = useCallback(
    async (sample: SampleCard) => {
      setPicked(sample.handle);
      const known = (reads.cards as Record<string, { titles: string[] } | undefined>)[sample.handle];
      if (known) {
        setHandle(sample.handle);
        addKnown({ kind: "file", name: `${sample.handle}.jpg`, preview: sample.src }, known.titles);
        return;
      }
      const blob = await fetch(sample.src).then((r) => r.blob());
      setHandle(sample.handle);
      addFile(new File([blob], `${sample.handle}.jpg`, { type: blob.type || "image/jpeg" }));
    },
    [addFile, addKnown, setHandle],
  );

  return { picked, pick, clearPicked: () => setPicked(null) };
}
