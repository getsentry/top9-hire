"use client";

import { PaperTexture } from "@paper-design/shaders-react";

export function Backdrop() {
  return (
    <PaperTexture
      className="backdrop"
      aria-hidden
      fit="cover"
      scale={1}
      colorBack="#e3cd9b"
      colorPaper="#e8d4a5"
      colorShadow="#8d6f3c"
      roughness={0.32}
      roughnessSize={0.3}
      roughnessRows={0.1}
      fiber={0.28}
      fiberSize={0.45}
      folds={0.22}
      foldSizeX={0.7}
      foldSizeY={0.4}
      foldOffsetX={0.62}
      foldOffsetY={0.08}
      wrinkles={0}
      crumples={0.14}
      crumpleCount={4}
      drops={0.08}
      angle={315}
      seed={19}
      maxPixelCount={1920 * 1080}
    />
  );
}
