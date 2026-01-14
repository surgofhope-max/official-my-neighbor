/**
 * @public
 * @enum
 */
export declare const ContainerFormat: {
    readonly FragmentedMP4: "FRAGMENTED_MP4";
    readonly TS: "TS";
};
/**
 * @public
 */
export type ContainerFormat = (typeof ContainerFormat)[keyof typeof ContainerFormat];
/**
 * @public
 * @enum
 */
export declare const ChannelLatencyMode: {
    readonly LowLatency: "LOW";
    readonly NormalLatency: "NORMAL";
};
/**
 * @public
 */
export type ChannelLatencyMode = (typeof ChannelLatencyMode)[keyof typeof ChannelLatencyMode];
/**
 * @public
 * @enum
 */
export declare const MultitrackMaximumResolution: {
    readonly FULL_HD: "FULL_HD";
    readonly HD: "HD";
    readonly SD: "SD";
};
/**
 * @public
 */
export type MultitrackMaximumResolution = (typeof MultitrackMaximumResolution)[keyof typeof MultitrackMaximumResolution];
/**
 * @public
 * @enum
 */
export declare const MultitrackPolicy: {
    readonly ALLOW: "ALLOW";
    readonly REQUIRE: "REQUIRE";
};
/**
 * @public
 */
export type MultitrackPolicy = (typeof MultitrackPolicy)[keyof typeof MultitrackPolicy];
/**
 * @public
 * @enum
 */
export declare const TranscodePreset: {
    readonly ConstrainedBandwidthTranscodePreset: "CONSTRAINED_BANDWIDTH_DELIVERY";
    readonly HigherBandwidthTranscodePreset: "HIGHER_BANDWIDTH_DELIVERY";
};
/**
 * @public
 */
export type TranscodePreset = (typeof TranscodePreset)[keyof typeof TranscodePreset];
/**
 * @public
 * @enum
 */
export declare const ChannelType: {
    readonly AdvancedHDChannelType: "ADVANCED_HD";
    readonly AdvancedSDChannelType: "ADVANCED_SD";
    readonly BasicChannelType: "BASIC";
    readonly StandardChannelType: "STANDARD";
};
/**
 * @public
 */
export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];
/**
 * @public
 * @enum
 */
export declare const RenditionConfigurationRendition: {
    readonly FULL_HD: "FULL_HD";
    readonly HD: "HD";
    readonly LOWEST_RESOLUTION: "LOWEST_RESOLUTION";
    readonly SD: "SD";
};
/**
 * @public
 */
export type RenditionConfigurationRendition = (typeof RenditionConfigurationRendition)[keyof typeof RenditionConfigurationRendition];
/**
 * @public
 * @enum
 */
export declare const RenditionConfigurationRenditionSelection: {
    readonly ALL: "ALL";
    readonly CUSTOM: "CUSTOM";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type RenditionConfigurationRenditionSelection = (typeof RenditionConfigurationRenditionSelection)[keyof typeof RenditionConfigurationRenditionSelection];
/**
 * @public
 * @enum
 */
export declare const RecordingMode: {
    readonly Disabled: "DISABLED";
    readonly Interval: "INTERVAL";
};
/**
 * @public
 */
export type RecordingMode = (typeof RecordingMode)[keyof typeof RecordingMode];
/**
 * @public
 * @enum
 */
export declare const ThumbnailConfigurationResolution: {
    readonly FULL_HD: "FULL_HD";
    readonly HD: "HD";
    readonly LOWEST_RESOLUTION: "LOWEST_RESOLUTION";
    readonly SD: "SD";
};
/**
 * @public
 */
export type ThumbnailConfigurationResolution = (typeof ThumbnailConfigurationResolution)[keyof typeof ThumbnailConfigurationResolution];
/**
 * @public
 * @enum
 */
export declare const ThumbnailConfigurationStorage: {
    readonly LATEST: "LATEST";
    readonly SEQUENTIAL: "SEQUENTIAL";
};
/**
 * @public
 */
export type ThumbnailConfigurationStorage = (typeof ThumbnailConfigurationStorage)[keyof typeof ThumbnailConfigurationStorage];
/**
 * @public
 * @enum
 */
export declare const RecordingConfigurationState: {
    readonly Active: "ACTIVE";
    readonly CreateFailed: "CREATE_FAILED";
    readonly Creating: "CREATING";
};
/**
 * @public
 */
export type RecordingConfigurationState = (typeof RecordingConfigurationState)[keyof typeof RecordingConfigurationState];
/**
 * @public
 * @enum
 */
export declare const StreamHealth: {
    readonly Starving: "STARVING";
    readonly StreamHealthy: "HEALTHY";
    readonly Unknown: "UNKNOWN";
};
/**
 * @public
 */
export type StreamHealth = (typeof StreamHealth)[keyof typeof StreamHealth];
/**
 * @public
 * @enum
 */
export declare const StreamState: {
    readonly StreamLive: "LIVE";
    readonly StreamOffline: "OFFLINE";
};
/**
 * @public
 */
export type StreamState = (typeof StreamState)[keyof typeof StreamState];
