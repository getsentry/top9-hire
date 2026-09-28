"use client";

import { PaperTexture } from "@paper-design/shaders-react";

export function Backdrop() {
  return (
    <PaperTexture
      className="backdrop"
      aria-hidden
      fit="cover"
      scale={1}
      colorBack="#dcc48e"
      colorPaper="#e2cb95"
      colorShadow="#7a5a26"
      roughness={0.55}
      roughnessSize={0.3}
      roughnessRows={0.15}
      fiber={0.35}
      fiberSize={0.45}
      folds={0.35}
      foldSizeX={0.7}
      foldSizeY={0.4}
      foldOffsetX={0.62}
      foldOffsetY={0.08}
      wrinkles={0}
      crumples={0.18}
      crumpleCount={4}
      drops={0.12}
      angle={315}
      seed={19}
      maxPixelCount={1920 * 1080}
    />
  );
}
