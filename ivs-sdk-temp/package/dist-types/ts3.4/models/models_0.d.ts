import {
  ChannelLatencyMode,
  ChannelType,
  ContainerFormat,
  MultitrackMaximumResolution,
  MultitrackPolicy,
  RecordingConfigurationState,
  RecordingMode,
  RenditionConfigurationRendition,
  RenditionConfigurationRenditionSelection,
  StreamHealth,
  StreamState,
  ThumbnailConfigurationResolution,
  ThumbnailConfigurationStorage,
  TranscodePreset,
} from "./enums";
export interface BatchGetChannelRequest {
  arns: string[] | undefined;
}
export interface MultitrackInputConfiguration {
  enabled?: boolean | undefined;
  policy?: MultitrackPolicy | undefined;
  maximumResolution?: MultitrackMaximumResolution | undefined;
}
export interface Srt {
  endpoint?: string | undefined;
  passphrase?: string | undefined;
}
export interface Channel {
  arn?: string | undefined;
  name?: string | undefined;
  latencyMode?: ChannelLatencyMode | undefined;
  type?: ChannelType | undefined;
  recordingConfigurationArn?: string | undefined;
  ingestEndpoint?: string | undefined;
  playbackUrl?: string | undefined;
  authorized?: boolean | undefined;
  tags?: Record<string, string> | undefined;
  insecureIngest?: boolean | undefined;
  preset?: TranscodePreset | undefined;
  srt?: Srt | undefined;
  playbackRestrictionPolicyArn?: string | undefined;
  multitrackInputConfiguration?: MultitrackInputConfiguration | undefined;
  containerFormat?: ContainerFormat | undefined;
}
export interface BatchError {
  arn?: string | undefined;
  code?: string | undefined;
  message?: string | undefined;
}
export interface BatchGetChannelResponse {
  channels?: Channel[] | undefined;
  errors?: BatchError[] | undefined;
}
export interface BatchGetStreamKeyRequest {
  arns: string[] | undefined;
}
export interface StreamKey {
  arn?: string | undefined;
  value?: string | undefined;
  channelArn?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface BatchGetStreamKeyResponse {
  streamKeys?: StreamKey[] | undefined;
  errors?: BatchError[] | undefined;
}
export interface BatchStartViewerSessionRevocationViewerSession {
  channelArn: string | undefined;
  viewerId: string | undefined;
  viewerSessionVersionsLessThanOrEqualTo?: number | undefined;
}
export interface BatchStartViewerSessionRevocationRequest {
  viewerSessions: BatchStartViewerSessionRevocationViewerSession[] | undefined;
}
export interface BatchStartViewerSessionRevocationError {
  channelArn: string | undefined;
  viewerId: string | undefined;
  code?: string | undefined;
  message?: string | undefined;
}
export interface BatchStartViewerSessionRevocationResponse {
  errors?: BatchStartViewerSessionRevocationError[] | undefined;
}
export interface CreateChannelRequest {
  name?: string | undefined;
  latencyMode?: ChannelLatencyMode | undefined;
  type?: ChannelType | undefined;
  authorized?: boolean | undefined;
  recordingConfigurationArn?: string | undefined;
  tags?: Record<string, string> | undefined;
  insecureIngest?: boolean | undefined;
  preset?: TranscodePreset | undefined;
  playbackRestrictionPolicyArn?: string | undefined;
  multitrackInputConfiguration?: MultitrackInputConfiguration | undefined;
  containerFormat?: ContainerFormat | undefined;
}
export interface CreateChannelResponse {
  channel?: Channel | undefined;
  streamKey?: StreamKey | undefined;
}
export interface CreatePlaybackRestrictionPolicyRequest {
  allowedCountries?: string[] | undefined;
  allowedOrigins?: string[] | undefined;
  enableStrictOriginEnforcement?: boolean | undefined;
  name?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface PlaybackRestrictionPolicy {
  arn: string | undefined;
  allowedCountries: string[] | undefined;
  allowedOrigins: string[] | undefined;
  enableStrictOriginEnforcement?: boolean | undefined;
  name?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface CreatePlaybackRestrictionPolicyResponse {
  playbackRestrictionPolicy?: PlaybackRestrictionPolicy | undefined;
}
export interface S3DestinationConfiguration {
  bucketName: string | undefined;
}
export interface DestinationConfiguration {
  s3?: S3DestinationConfiguration | undefined;
}
export interface RenditionConfiguration {
  renditionSelection?: RenditionConfigurationRenditionSelection | undefined;
  renditions?: RenditionConfigurationRendition[] | undefined;
}
export interface ThumbnailConfiguration {
  recordingMode?: RecordingMode | undefined;
  targetIntervalSeconds?: number | undefined;
  resolution?: ThumbnailConfigurationResolution | undefined;
  storage?: ThumbnailConfigurationStorage[] | undefined;
}
export interface CreateRecordingConfigurationRequest {
  name?: string | undefined;
  destinationConfiguration: DestinationConfiguration | undefined;
  tags?: Record<string, string> | undefined;
  thumbnailConfiguration?: ThumbnailConfiguration | undefined;
  recordingReconnectWindowSeconds?: number | undefined;
  renditionConfiguration?: RenditionConfiguration | undefined;
}
export interface RecordingConfiguration {
  arn: string | undefined;
  name?: string | undefined;
  destinationConfiguration: DestinationConfiguration | undefined;
  state: RecordingConfigurationState | undefined;
  tags?: Record<string, string> | undefined;
  thumbnailConfiguration?: ThumbnailConfiguration | undefined;
  recordingReconnectWindowSeconds?: number | undefined;
  renditionConfiguration?: RenditionConfiguration | undefined;
}
export interface CreateRecordingConfigurationResponse {
  recordingConfiguration?: RecordingConfiguration | undefined;
}
export interface CreateStreamKeyRequest {
  channelArn: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface CreateStreamKeyResponse {
  streamKey?: StreamKey | undefined;
}
export interface DeleteChannelRequest {
  arn: string | undefined;
}
export interface DeletePlaybackKeyPairRequest {
  arn: string | undefined;
}
export interface DeletePlaybackKeyPairResponse {}
export interface DeletePlaybackRestrictionPolicyRequest {
  arn: string | undefined;
}
export interface DeleteRecordingConfigurationRequest {
  arn: string | undefined;
}
export interface DeleteStreamKeyRequest {
  arn: string | undefined;
}
export interface GetChannelRequest {
  arn: string | undefined;
}
export interface GetChannelResponse {
  channel?: Channel | undefined;
}
export interface GetPlaybackKeyPairRequest {
  arn: string | undefined;
}
export interface PlaybackKeyPair {
  arn?: string | undefined;
  name?: string | undefined;
  fingerprint?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface GetPlaybackKeyPairResponse {
  keyPair?: PlaybackKeyPair | undefined;
}
export interface GetPlaybackRestrictionPolicyRequest {
  arn: string | undefined;
}
export interface GetPlaybackRestrictionPolicyResponse {
  playbackRestrictionPolicy?: PlaybackRestrictionPolicy | undefined;
}
export interface GetRecordingConfigurationRequest {
  arn: string | undefined;
}
export interface GetRecordingConfigurationResponse {
  recordingConfiguration?: RecordingConfiguration | undefined;
}
export interface GetStreamRequest {
  channelArn: string | undefined;
}
export interface _Stream {
  channelArn?: string | undefined;
  streamId?: string | undefined;
  playbackUrl?: string | undefined;
  startTime?: Date | undefined;
  state?: StreamState | undefined;
  health?: StreamHealth | undefined;
  viewerCount?: number | undefined;
}
export interface GetStreamResponse {
  stream?: _Stream | undefined;
}
export interface GetStreamKeyRequest {
  arn: string | undefined;
}
export interface GetStreamKeyResponse {
  streamKey?: StreamKey | undefined;
}
export interface GetStreamSessionRequest {
  channelArn: string | undefined;
  streamId?: string | undefined;
}
export interface AudioConfiguration {
  codec?: string | undefined;
  targetBitrate?: number | undefined;
  sampleRate?: number | undefined;
  channels?: number | undefined;
  track?: string | undefined;
}
export interface VideoConfiguration {
  avcProfile?: string | undefined;
  avcLevel?: string | undefined;
  codec?: string | undefined;
  encoder?: string | undefined;
  targetBitrate?: number | undefined;
  targetFramerate?: number | undefined;
  videoHeight?: number | undefined;
  videoWidth?: number | undefined;
  level?: string | undefined;
  track?: string | undefined;
  profile?: string | undefined;
}
export interface IngestConfiguration {
  video?: VideoConfiguration | undefined;
  audio?: AudioConfiguration | undefined;
}
export interface IngestConfigurations {
  videoConfigurations: VideoConfiguration[] | undefined;
  audioConfigurations: AudioConfiguration[] | undefined;
}
export interface StreamEvent {
  name?: string | undefined;
  type?: string | undefined;
  eventTime?: Date | undefined;
  code?: string | undefined;
}
export interface StreamSession {
  streamId?: string | undefined;
  startTime?: Date | undefined;
  endTime?: Date | undefined;
  channel?: Channel | undefined;
  ingestConfiguration?: IngestConfiguration | undefined;
  ingestConfigurations?: IngestConfigurations | undefined;
  recordingConfiguration?: RecordingConfiguration | undefined;
  truncatedEvents?: StreamEvent[] | undefined;
}
export interface GetStreamSessionResponse {
  streamSession?: StreamSession | undefined;
}
export interface ImportPlaybackKeyPairRequest {
  publicKeyMaterial: string | undefined;
  name?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface ImportPlaybackKeyPairResponse {
  keyPair?: PlaybackKeyPair | undefined;
}
export interface ListChannelsRequest {
  filterByName?: string | undefined;
  filterByRecordingConfigurationArn?: string | undefined;
  filterByPlaybackRestrictionPolicyArn?: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface ChannelSummary {
  arn?: string | undefined;
  name?: string | undefined;
  latencyMode?: ChannelLatencyMode | undefined;
  authorized?: boolean | undefined;
  recordingConfigurationArn?: string | undefined;
  tags?: Record<string, string> | undefined;
  insecureIngest?: boolean | undefined;
  type?: ChannelType | undefined;
  preset?: TranscodePreset | undefined;
  playbackRestrictionPolicyArn?: string | undefined;
}
export interface ListChannelsResponse {
  channels: ChannelSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface ListPlaybackKeyPairsRequest {
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface PlaybackKeyPairSummary {
  arn?: string | undefined;
  name?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface ListPlaybackKeyPairsResponse {
  keyPairs: PlaybackKeyPairSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface ListPlaybackRestrictionPoliciesRequest {
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface PlaybackRestrictionPolicySummary {
  arn: string | undefined;
  allowedCountries: string[] | undefined;
  allowedOrigins: string[] | undefined;
  enableStrictOriginEnforcement?: boolean | undefined;
  name?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface ListPlaybackRestrictionPoliciesResponse {
  playbackRestrictionPolicies: PlaybackRestrictionPolicySummary[] | undefined;
  nextToken?: string | undefined;
}
export interface ListRecordingConfigurationsRequest {
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface RecordingConfigurationSummary {
  arn: string | undefined;
  name?: string | undefined;
  destinationConfiguration: DestinationConfiguration | undefined;
  state: RecordingConfigurationState | undefined;
  tags?: Record<string, string> | undefined;
}
export interface ListRecordingConfigurationsResponse {
  recordingConfigurations: RecordingConfigurationSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface ListStreamKeysRequest {
  channelArn: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface StreamKeySummary {
  arn?: string | undefined;
  channelArn?: string | undefined;
  tags?: Record<string, string> | undefined;
}
export interface ListStreamKeysResponse {
  streamKeys: StreamKeySummary[] | undefined;
  nextToken?: string | undefined;
}
export interface StreamFilters {
  health?: StreamHealth | undefined;
}
export interface ListStreamsRequest {
  filterBy?: StreamFilters | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface StreamSummary {
  channelArn?: string | undefined;
  streamId?: string | undefined;
  state?: StreamState | undefined;
  health?: StreamHealth | undefined;
  viewerCount?: number | undefined;
  startTime?: Date | undefined;
}
export interface ListStreamsResponse {
  streams: StreamSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface ListStreamSessionsRequest {
  channelArn: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface StreamSessionSummary {
  streamId?: string | undefined;
  startTime?: Date | undefined;
  endTime?: Date | undefined;
  hasErrorEvent?: boolean | undefined;
}
export interface ListStreamSessionsResponse {
  streamSessions: StreamSessionSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface ListTagsForResourceRequest {
  resourceArn: string | undefined;
}
export interface ListTagsForResourceResponse {
  tags: Record<string, string> | undefined;
}
export interface PutMetadataRequest {
  channelArn: string | undefined;
  metadata: string | undefined;
}
export interface StartViewerSessionRevocationRequest {
  channelArn: string | undefined;
  viewerId: string | undefined;
  viewerSessionVersionsLessThanOrEqualTo?: number | undefined;
}
export interface StartViewerSessionRevocationResponse {}
export interface StopStreamRequest {
  channelArn: string | undefined;
}
export interface StopStreamResponse {}
export interface TagResourceRequest {
  resourceArn: string | undefined;
  tags: Record<string, string> | undefined;
}
export interface TagResourceResponse {}
export interface UntagResourceRequest {
  resourceArn: string | undefined;
  tagKeys: string[] | undefined;
}
export interface UntagResourceResponse {}
export interface UpdateChannelRequest {
  arn: string | undefined;
  name?: string | undefined;
  latencyMode?: ChannelLatencyMode | undefined;
  type?: ChannelType | undefined;
  authorized?: boolean | undefined;
  recordingConfigurationArn?: string | undefined;
  insecureIngest?: boolean | undefined;
  preset?: TranscodePreset | undefined;
  playbackRestrictionPolicyArn?: string | undefined;
  multitrackInputConfiguration?: MultitrackInputConfiguration | undefined;
  containerFormat?: ContainerFormat | undefined;
}
export interface UpdateChannelResponse {
  channel?: Channel | undefined;
}
export interface UpdatePlaybackRestrictionPolicyRequest {
  arn: string | undefined;
  allowedCountries?: string[] | undefined;
  allowedOrigins?: string[] | undefined;
  enableStrictOriginEnforcement?: boolean | undefined;
  name?: string | undefined;
}
export interface UpdatePlaybackRestrictionPolicyResponse {
  playbackRestrictionPolicy?: PlaybackRestrictionPolicy | undefined;
}
