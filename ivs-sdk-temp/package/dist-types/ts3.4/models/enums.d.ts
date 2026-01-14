export declare const ContainerFormat: {
  readonly FragmentedMP4: "FRAGMENTED_MP4";
  readonly TS: "TS";
};
export type ContainerFormat =
  (typeof ContainerFormat)[keyof typeof ContainerFormat];
export declare const ChannelLatencyMode: {
  readonly LowLatency: "LOW";
  readonly NormalLatency: "NORMAL";
};
export type ChannelLatencyMode =
  (typeof ChannelLatencyMode)[keyof typeof ChannelLatencyMode];
export declare const MultitrackMaximumResolution: {
  readonly FULL_HD: "FULL_HD";
  readonly HD: "HD";
  readonly SD: "SD";
};
export type MultitrackMaximumResolution =
  (typeof MultitrackMaximumResolution)[keyof typeof MultitrackMaximumResolution];
export declare const MultitrackPolicy: {
  readonly ALLOW: "ALLOW";
  readonly REQUIRE: "REQUIRE";
};
export type MultitrackPolicy =
  (typeof MultitrackPolicy)[keyof typeof MultitrackPolicy];
export declare const TranscodePreset: {
  readonly ConstrainedBandwidthTranscodePreset: "CONSTRAINED_BANDWIDTH_DELIVERY";
  readonly HigherBandwidthTranscodePreset: "HIGHER_BANDWIDTH_DELIVERY";
};
export type TranscodePreset =
  (typeof TranscodePreset)[keyof typeof TranscodePreset];
export declare const ChannelType: {
  readonly AdvancedHDChannelType: "ADVANCED_HD";
  readonly AdvancedSDChannelType: "ADVANCED_SD";
  readonly BasicChannelType: "BASIC";
  readonly StandardChannelType: "STANDARD";
};
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];
export declare const RenditionConfigurationRendition: {
  readonly FULL_HD: "FULL_HD";
  readonly HD: "HD";
  readonly LOWEST_RESOLUTION: "LOWEST_RESOLUTION";
  readonly SD: "SD";
};
export type RenditionConfigurationRendition =
  (typeof RenditionConfigurationRendition)[keyof typeof RenditionConfigurationRendition];
export declare const RenditionConfigurationRenditionSelection: {
  readonly ALL: "ALL";
  readonly CUSTOM: "CUSTOM";
  readonly NONE: "NONE";
};
export type RenditionConfigurationRenditionSelection =
  (typeof RenditionConfigurationRenditionSelection)[keyof typeof RenditionConfigurationRenditionSelection];
export declare const RecordingMode: {
  readonly Disabled: "DISABLED";
  readonly Interval: "INTERVAL";
};
export type RecordingMode = (typeof RecordingMode)[keyof typeof RecordingMode];
export declare const ThumbnailConfigurationResolution: {
  readonly FULL_HD: "FULL_HD";
  readonly HD: "HD";
  readonly LOWEST_RESOLUTION: "LOWEST_RESOLUTION";
  readonly SD: "SD";
};
export type ThumbnailConfigurationResolution =
  (typeof ThumbnailConfigurationResolution)[keyof typeof ThumbnailConfigurationResolution];
export declare const ThumbnailConfigurationStorage: {
  readonly LATEST: "LATEST";
  readonly SEQUENTIAL: "SEQUENTIAL";
};
export type ThumbnailConfigurationStorage =
  (typeof ThumbnailConfigurationStorage)[keyof typeof ThumbnailConfigurationStorage];
export declare const RecordingConfigurationState: {
  readonly Active: "ACTIVE";
  readonly CreateFailed: "CREATE_FAILED";
  readonly Creating: "CREATING";
};
export type RecordingConfigurationState =
  (typeof RecordingConfigurationState)[keyof typeof RecordingConfigurationState];
export declare const StreamHealth: {
  readonly Starving: "STARVING";
  readonly StreamHealthy: "HEALTHY";
  readonly Unknown: "UNKNOWN";
};
export type StreamHealth = (typeof StreamHealth)[keyof typeof StreamHealth];
export declare const StreamState: {
  readonly StreamLive: "LIVE";
  readonly StreamOffline: "OFFLINE";
};
export type StreamState = (typeof StreamState)[keyof typeof StreamState];
