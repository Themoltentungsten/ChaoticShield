// ─────────────────────────────────────────────────────────────────────────────
// Cloud AI detector — STUB for future implementation.
// Not functional in v1; exists to keep the provider interface modular.
// ─────────────────────────────────────────────────────────────────────────────
import type { DetectedRegion, DetectionProgress, SensitiveDataDetector } from "./detector";

/**
 * Placeholder for a cloud-based detection provider.
 * When implemented, this would call an external AI API (e.g. Google Vision,
 * AWS Textract) for more advanced detection.
 *
 * Security requirement: the user must explicitly opt-in to cloud processing
 * and acknowledge that image data will be transmitted externally.
 *
 * Configuration via environment variables:
 *   AI_PROVIDER=cloud
 *   AI_API_KEY=<your-key>
 *   ENABLE_CLOUD_AI=true
 */
export class CloudDetector implements SensitiveDataDetector {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async detect(
    _image: HTMLImageElement | HTMLCanvasElement | ImageData,
    onProgress?: (p: DetectionProgress) => void,
  ): Promise<DetectedRegion[]> {
    onProgress?.({
      stage: "done",
      message: "Cloud detection is not yet implemented. Use local detection instead.",
      progress: 1,
    });
    throw new Error(
      "Cloud AI detection is not available in this version. " +
      "Set AI_PROVIDER=local in your environment to use the built-in OCR engine.",
    );
  }

  destroy(): void {
    // No resources to clean up
  }
}
