'use strict';

var middlewareHostHeader = require('@aws-sdk/middleware-host-header');
var middlewareLogger = require('@aws-sdk/middleware-logger');
var middlewareRecursionDetection = require('@aws-sdk/middleware-recursion-detection');
var middlewareUserAgent = require('@aws-sdk/middleware-user-agent');
var configResolver = require('@smithy/config-resolver');
var core = require('@smithy/core');
var schema = require('@smithy/core/schema');
var middlewareContentLength = require('@smithy/middleware-content-length');
var middlewareEndpoint = require('@smithy/middleware-endpoint');
var middlewareRetry = require('@smithy/middleware-retry');
var smithyClient = require('@smithy/smithy-client');
var httpAuthSchemeProvider = require('./auth/httpAuthSchemeProvider');
var runtimeConfig = require('./runtimeConfig');
var regionConfigResolver = require('@aws-sdk/region-config-resolver');
var protocolHttp = require('@smithy/protocol-http');

const resolveClientEndpointParameters = (options) => {
    return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "ivs",
    });
};
const commonParams = {
    UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
    Endpoint: { type: "builtInParams", name: "endpoint" },
    Region: { type: "builtInParams", name: "region" },
    UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
};

const getHttpAuthExtensionConfiguration = (runtimeConfig) => {
    const _httpAuthSchemes = runtimeConfig.httpAuthSchemes;
    let _httpAuthSchemeProvider = runtimeConfig.httpAuthSchemeProvider;
    let _credentials = runtimeConfig.credentials;
    return {
        setHttpAuthScheme(httpAuthScheme) {
            const index = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
            if (index === -1) {
                _httpAuthSchemes.push(httpAuthScheme);
            }
            else {
                _httpAuthSchemes.splice(index, 1, httpAuthScheme);
            }
        },
        httpAuthSchemes() {
            return _httpAuthSchemes;
        },
        setHttpAuthSchemeProvider(httpAuthSchemeProvider) {
            _httpAuthSchemeProvider = httpAuthSchemeProvider;
        },
        httpAuthSchemeProvider() {
            return _httpAuthSchemeProvider;
        },
        setCredentials(credentials) {
            _credentials = credentials;
        },
        credentials() {
            return _credentials;
        },
    };
};
const resolveHttpAuthRuntimeConfig = (config) => {
    return {
        httpAuthSchemes: config.httpAuthSchemes(),
        httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
        credentials: config.credentials(),
    };
};

const resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = Object.assign(regionConfigResolver.getAwsRegionExtensionConfiguration(runtimeConfig), smithyClient.getDefaultExtensionConfiguration(runtimeConfig), protocolHttp.getHttpHandlerExtensionConfiguration(runtimeConfig), getHttpAuthExtensionConfiguration(runtimeConfig));
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return Object.assign(runtimeConfig, regionConfigResolver.resolveAwsRegionExtensionConfiguration(extensionConfiguration), smithyClient.resolveDefaultRuntimeConfig(extensionConfiguration), protocolHttp.resolveHttpHandlerRuntimeConfig(extensionConfiguration), resolveHttpAuthRuntimeConfig(extensionConfiguration));
};

class IvsClient extends smithyClient.Client {
    config;
    constructor(...[configuration]) {
        const _config_0 = runtimeConfig.getRuntimeConfig(configuration || {});
        super(_config_0);
        this.initConfig = _config_0;
        const _config_1 = resolveClientEndpointParameters(_config_0);
        const _config_2 = middlewareUserAgent.resolveUserAgentConfig(_config_1);
        const _config_3 = middlewareRetry.resolveRetryConfig(_config_2);
        const _config_4 = configResolver.resolveRegionConfig(_config_3);
        const _config_5 = middlewareHostHeader.resolveHostHeaderConfig(_config_4);
        const _config_6 = middlewareEndpoint.resolveEndpointConfig(_config_5);
        const _config_7 = httpAuthSchemeProvider.resolveHttpAuthSchemeConfig(_config_6);
        const _config_8 = resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        this.config = _config_8;
        this.middlewareStack.use(schema.getSchemaSerdePlugin(this.config));
        this.middlewareStack.use(middlewareUserAgent.getUserAgentPlugin(this.config));
        this.middlewareStack.use(middlewareRetry.getRetryPlugin(this.config));
        this.middlewareStack.use(middlewareContentLength.getContentLengthPlugin(this.config));
        this.middlewareStack.use(middlewareHostHeader.getHostHeaderPlugin(this.config));
        this.middlewareStack.use(middlewareLogger.getLoggerPlugin(this.config));
        this.middlewareStack.use(middlewareRecursionDetection.getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(core.getHttpAuthSchemeEndpointRuleSetPlugin(this.config, {
            httpAuthSchemeParametersProvider: httpAuthSchemeProvider.defaultIvsHttpAuthSchemeParametersProvider,
            identityProviderConfigProvider: async (config) => new core.DefaultIdentityProviderConfig({
                "aws.auth#sigv4": config.credentials,
            }),
        }));
        this.middlewareStack.use(core.getHttpSigningPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

class IvsServiceException extends smithyClient.ServiceException {
    constructor(options) {
        super(options);
        Object.setPrototypeOf(this, IvsServiceException.prototype);
    }
}

class AccessDeniedException extends IvsServiceException {
    name = "AccessDeniedException";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "AccessDeniedException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, AccessDeniedException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class PendingVerification extends IvsServiceException {
    name = "PendingVerification";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "PendingVerification",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, PendingVerification.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class ThrottlingException extends IvsServiceException {
    name = "ThrottlingException";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "ThrottlingException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ThrottlingException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class ValidationException extends IvsServiceException {
    name = "ValidationException";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "ValidationException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ValidationException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class ResourceNotFoundException extends IvsServiceException {
    name = "ResourceNotFoundException";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "ResourceNotFoundException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class ServiceQuotaExceededException extends IvsServiceException {
    name = "ServiceQuotaExceededException";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "ServiceQuotaExceededException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ServiceQuotaExceededException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class ConflictException extends IvsServiceException {
    name = "ConflictException";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "ConflictException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ConflictException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class InternalServerException extends IvsServiceException {
    name = "InternalServerException";
    $fault = "server";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "InternalServerException",
            $fault: "server",
            ...opts,
        });
        Object.setPrototypeOf(this, InternalServerException.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class ChannelNotBroadcasting extends IvsServiceException {
    name = "ChannelNotBroadcasting";
    $fault = "client";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "ChannelNotBroadcasting",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ChannelNotBroadcasting.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}
class StreamUnavailable extends IvsServiceException {
    name = "StreamUnavailable";
    $fault = "server";
    exceptionMessage;
    constructor(opts) {
        super({
            name: "StreamUnavailable",
            $fault: "server",
            ...opts,
        });
        Object.setPrototypeOf(this, StreamUnavailable.prototype);
        this.exceptionMessage = opts.exceptionMessage;
    }
}

const _AC = "AudioConfiguration";
const _ACL = "AudioConfigurationList";
const _ADE = "AccessDeniedException";
const _BE = "BatchError";
const _BEa = "BatchErrors";
const _BGC = "BatchGetChannel";
const _BGCR = "BatchGetChannelRequest";
const _BGCRa = "BatchGetChannelResponse";
const _BGSK = "BatchGetStreamKey";
const _BGSKR = "BatchGetStreamKeyRequest";
const _BGSKRa = "BatchGetStreamKeyResponse";
const _BSVSR = "BatchStartViewerSessionRevocation";
const _BSVSRE = "BatchStartViewerSessionRevocationError";
const _BSVSREa = "BatchStartViewerSessionRevocationErrors";
const _BSVSRR = "BatchStartViewerSessionRevocationRequest";
const _BSVSRRa = "BatchStartViewerSessionRevocationResponse";
const _BSVSRVS = "BatchStartViewerSessionRevocationViewerSession";
const _BSVSRVSL = "BatchStartViewerSessionRevocationViewerSessionList";
const _C = "Channel";
const _CC = "CreateChannel";
const _CCR = "CreateChannelRequest";
const _CCRr = "CreateChannelResponse";
const _CE = "ConflictException";
const _CL = "ChannelList";
const _CNB = "ChannelNotBroadcasting";
const _CPRP = "CreatePlaybackRestrictionPolicy";
const _CPRPR = "CreatePlaybackRestrictionPolicyRequest";
const _CPRPRr = "CreatePlaybackRestrictionPolicyResponse";
const _CRC = "CreateRecordingConfiguration";
const _CRCR = "CreateRecordingConfigurationRequest";
const _CRCRr = "CreateRecordingConfigurationResponse";
const _CS = "ChannelSummary";
const _CSK = "CreateStreamKey";
const _CSKR = "CreateStreamKeyRequest";
const _CSKRr = "CreateStreamKeyResponse";
const _Ch = "Channels";
const _DC = "DestinationConfiguration";
const _DCR = "DeleteChannelRequest";
const _DCe = "DeleteChannel";
const _DPKP = "DeletePlaybackKeyPair";
const _DPKPR = "DeletePlaybackKeyPairRequest";
const _DPKPRe = "DeletePlaybackKeyPairResponse";
const _DPRP = "DeletePlaybackRestrictionPolicy";
const _DPRPR = "DeletePlaybackRestrictionPolicyRequest";
const _DRC = "DeleteRecordingConfiguration";
const _DRCR = "DeleteRecordingConfigurationRequest";
const _DSK = "DeleteStreamKey";
const _DSKR = "DeleteStreamKeyRequest";
const _GC = "GetChannel";
const _GCR = "GetChannelRequest";
const _GCRe = "GetChannelResponse";
const _GPKP = "GetPlaybackKeyPair";
const _GPKPR = "GetPlaybackKeyPairRequest";
const _GPKPRe = "GetPlaybackKeyPairResponse";
const _GPRP = "GetPlaybackRestrictionPolicy";
const _GPRPR = "GetPlaybackRestrictionPolicyRequest";
const _GPRPRe = "GetPlaybackRestrictionPolicyResponse";
const _GRC = "GetRecordingConfiguration";
const _GRCR = "GetRecordingConfigurationRequest";
const _GRCRe = "GetRecordingConfigurationResponse";
const _GS = "GetStream";
const _GSK = "GetStreamKey";
const _GSKR = "GetStreamKeyRequest";
const _GSKRe = "GetStreamKeyResponse";
const _GSR = "GetStreamRequest";
const _GSRe = "GetStreamResponse";
const _GSS = "GetStreamSession";
const _GSSR = "GetStreamSessionRequest";
const _GSSRe = "GetStreamSessionResponse";
const _IC = "IngestConfiguration";
const _ICn = "IngestConfigurations";
const _IPKP = "ImportPlaybackKeyPair";
const _IPKPR = "ImportPlaybackKeyPairRequest";
const _IPKPRm = "ImportPlaybackKeyPairResponse";
const _ISE = "InternalServerException";
const _LC = "ListChannels";
const _LCR = "ListChannelsRequest";
const _LCRi = "ListChannelsResponse";
const _LPKP = "ListPlaybackKeyPairs";
const _LPKPR = "ListPlaybackKeyPairsRequest";
const _LPKPRi = "ListPlaybackKeyPairsResponse";
const _LPRP = "ListPlaybackRestrictionPolicies";
const _LPRPR = "ListPlaybackRestrictionPoliciesRequest";
const _LPRPRi = "ListPlaybackRestrictionPoliciesResponse";
const _LRC = "ListRecordingConfigurations";
const _LRCR = "ListRecordingConfigurationsRequest";
const _LRCRi = "ListRecordingConfigurationsResponse";
const _LS = "ListStreams";
const _LSK = "ListStreamKeys";
const _LSKR = "ListStreamKeysRequest";
const _LSKRi = "ListStreamKeysResponse";
const _LSR = "ListStreamsRequest";
const _LSRi = "ListStreamsResponse";
const _LSS = "ListStreamSessions";
const _LSSR = "ListStreamSessionsRequest";
const _LSSRi = "ListStreamSessionsResponse";
const _LTFR = "ListTagsForResource";
const _LTFRR = "ListTagsForResourceRequest";
const _LTFRRi = "ListTagsForResourceResponse";
const _MIC = "MultitrackInputConfiguration";
const _PKP = "PlaybackKeyPair";
const _PKPL = "PlaybackKeyPairList";
const _PKPS = "PlaybackKeyPairSummary";
const _PM = "PutMetadata";
const _PMR = "PutMetadataRequest";
const _PRP = "PlaybackRestrictionPolicy";
const _PRPL = "PlaybackRestrictionPolicyList";
const _PRPS = "PlaybackRestrictionPolicySummary";
const _PV = "PendingVerification";
const _RC = "RecordingConfiguration";
const _RCL = "RecordingConfigurationList";
const _RCS = "RecordingConfigurationSummary";
const _RCe = "RenditionConfiguration";
const _RNFE = "ResourceNotFoundException";
const _S = "Srt";
const _SDC = "S3DestinationConfiguration";
const _SE = "StreamEvent";
const _SEt = "StreamEvents";
const _SF = "StreamFilters";
const _SK = "StreamKey";
const _SKL = "StreamKeyList";
const _SKS = "StreamKeySummary";
const _SKV = "StreamKeyValue";
const _SKt = "StreamKeys";
const _SL = "StreamList";
const _SM = "StreamMetadata";
const _SP = "SrtPassphrase";
const _SQEE = "ServiceQuotaExceededException";
const _SS = "StreamSession";
const _SSL = "StreamSessionList";
const _SSR = "StopStreamRequest";
const _SSRt = "StopStreamResponse";
const _SSS = "StreamSessionSummary";
const _SSt = "StreamSummary";
const _SSto = "StopStream";
const _SU = "StreamUnavailable";
const _SVSR = "StartViewerSessionRevocation";
const _SVSRR = "StartViewerSessionRevocationRequest";
const _SVSRRt = "StartViewerSessionRevocationResponse";
const _St = "Stream";
const _TC = "ThumbnailConfiguration";
const _TE = "ThrottlingException";
const _TR = "TagResource";
const _TRR = "TagResourceRequest";
const _TRRa = "TagResourceResponse";
const _UC = "UpdateChannel";
const _UCR = "UpdateChannelRequest";
const _UCRp = "UpdateChannelResponse";
const _UPRP = "UpdatePlaybackRestrictionPolicy";
const _UPRPR = "UpdatePlaybackRestrictionPolicyRequest";
const _UPRPRp = "UpdatePlaybackRestrictionPolicyResponse";
const _UR = "UntagResource";
const _URR = "UntagResourceRequest";
const _URRn = "UntagResourceResponse";
const _VC = "VideoConfiguration";
const _VCL = "VideoConfigurationList";
const _VE = "ValidationException";
const _a = "arn";
const _aC = "allowedCountries";
const _aCu = "audioConfigurations";
const _aL = "avcLevel";
const _aO = "allowedOrigins";
const _aP = "avcProfile";
const _ar = "arns";
const _au = "authorized";
const _aud = "audio";
const _bN = "bucketName";
const _c = "client";
const _cA = "channelArn";
const _cF = "containerFormat";
const _ch = "channels";
const _cha = "channel";
const _co = "codec";
const _cod = "code";
const _dC = "destinationConfiguration";
const _e = "error";
const _eM = "exceptionMessage";
const _eSOE = "enableStrictOriginEnforcement";
const _eT = "eventTime";
const _eTn = "endTime";
const _en = "enabled";
const _enc = "encoder";
const _end = "endpoint";
const _er = "errors";
const _f = "fingerprint";
const _fB = "filterBy";
const _fBN = "filterByName";
const _fBPRPA = "filterByPlaybackRestrictionPolicyArn";
const _fBRCA = "filterByRecordingConfigurationArn";
const _h = "health";
const _hE = "httpError";
const _hEE = "hasErrorEvent";
const _hQ = "httpQuery";
const _ht = "http";
const _iC = "ingestConfiguration";
const _iCn = "ingestConfigurations";
const _iE = "ingestEndpoint";
const _iI = "insecureIngest";
const _kP = "keyPair";
const _kPe = "keyPairs";
const _l = "level";
const _lM = "latencyMode";
const _m = "message";
const _mIC = "multitrackInputConfiguration";
const _mR = "maxResults";
const _mRa = "maximumResolution";
const _me = "metadata";
const _n = "name";
const _nT = "nextToken";
const _p = "preset";
const _pKM = "publicKeyMaterial";
const _pRP = "playbackRestrictionPolicy";
const _pRPA = "playbackRestrictionPolicyArn";
const _pRPl = "playbackRestrictionPolicies";
const _pU = "playbackUrl";
const _pa = "passphrase";
const _po = "policy";
const _pr = "profile";
const _r = "renditions";
const _rA = "resourceArn";
const _rC = "renditionConfiguration";
const _rCA = "recordingConfigurationArn";
const _rCe = "recordingConfiguration";
const _rCec = "recordingConfigurations";
const _rM = "recordingMode";
const _rRWS = "recordingReconnectWindowSeconds";
const _rS = "renditionSelection";
const _re = "resolution";
const _s = "srt";
const _sI = "streamId";
const _sK = "streamKeys";
const _sKt = "streamKey";
const _sR = "sampleRate";
const _sS = "streamSession";
const _sSt = "streamSessions";
const _sT = "startTime";
const _s_ = "s3";
const _se = "server";
const _sm = "smithy.ts.sdk.synthetic.com.amazonaws.ivs";
const _st = "stream";
const _sta = "state";
const _sto = "storage";
const _str = "streams";
const _t = "track";
const _tB = "targetBitrate";
const _tC = "thumbnailConfiguration";
const _tE = "truncatedEvents";
const _tF = "targetFramerate";
const _tIS = "targetIntervalSeconds";
const _tK = "tagKeys";
const _ta = "tags";
const _ty = "type";
const _v = "video";
const _vC = "videoConfigurations";
const _vCi = "viewerCount";
const _vH = "videoHeight";
const _vI = "viewerId";
const _vS = "viewerSessions";
const _vSVLTOET = "viewerSessionVersionsLessThanOrEqualTo";
const _vW = "videoWidth";
const _va = "value";
const n0 = "com.amazonaws.ivs";
var SrtPassphrase = [0, n0, _SP, 8, 0];
var StreamKeyValue = [0, n0, _SKV, 8, 0];
var StreamMetadata = [0, n0, _SM, 8, 0];
var AccessDeniedException$ = [-3, n0, _ADE,
    { [_e]: _c, [_hE]: 403 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(AccessDeniedException$, AccessDeniedException);
var AudioConfiguration$ = [3, n0, _AC,
    0,
    [_co, _tB, _sR, _ch, _t],
    [0, 1, 1, 1, 0]
];
var BatchError$ = [3, n0, _BE,
    0,
    [_a, _cod, _m],
    [0, 0, 0]
];
var BatchGetChannelRequest$ = [3, n0, _BGCR,
    0,
    [_ar],
    [64 | 0]
];
var BatchGetChannelResponse$ = [3, n0, _BGCRa,
    0,
    [_ch, _er],
    [[() => Channels, 0], () => BatchErrors]
];
var BatchGetStreamKeyRequest$ = [3, n0, _BGSKR,
    0,
    [_ar],
    [64 | 0]
];
var BatchGetStreamKeyResponse$ = [3, n0, _BGSKRa,
    0,
    [_sK, _er],
    [[() => StreamKeys, 0], () => BatchErrors]
];
var BatchStartViewerSessionRevocationError$ = [3, n0, _BSVSRE,
    0,
    [_cA, _vI, _cod, _m],
    [0, 0, 0, 0]
];
var BatchStartViewerSessionRevocationRequest$ = [3, n0, _BSVSRR,
    0,
    [_vS],
    [() => BatchStartViewerSessionRevocationViewerSessionList]
];
var BatchStartViewerSessionRevocationResponse$ = [3, n0, _BSVSRRa,
    0,
    [_er],
    [() => BatchStartViewerSessionRevocationErrors]
];
var BatchStartViewerSessionRevocationViewerSession$ = [3, n0, _BSVSRVS,
    0,
    [_cA, _vI, _vSVLTOET],
    [0, 0, 1]
];
var Channel$ = [3, n0, _C,
    0,
    [_a, _n, _lM, _ty, _rCA, _iE, _pU, _au, _ta, _iI, _p, _s, _pRPA, _mIC, _cF],
    [0, 0, 0, 0, 0, 0, 0, 2, 128 | 0, 2, 0, [() => Srt$, 0], 0, () => MultitrackInputConfiguration$, 0]
];
var ChannelNotBroadcasting$ = [-3, n0, _CNB,
    { [_e]: _c, [_hE]: 404 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(ChannelNotBroadcasting$, ChannelNotBroadcasting);
var ChannelSummary$ = [3, n0, _CS,
    0,
    [_a, _n, _lM, _au, _rCA, _ta, _iI, _ty, _p, _pRPA],
    [0, 0, 0, 2, 0, 128 | 0, 2, 0, 0, 0]
];
var ConflictException$ = [-3, n0, _CE,
    { [_e]: _c, [_hE]: 409 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(ConflictException$, ConflictException);
var CreateChannelRequest$ = [3, n0, _CCR,
    0,
    [_n, _lM, _ty, _au, _rCA, _ta, _iI, _p, _pRPA, _mIC, _cF],
    [0, 0, 0, 2, 0, 128 | 0, 2, 0, 0, () => MultitrackInputConfiguration$, 0]
];
var CreateChannelResponse$ = [3, n0, _CCRr,
    0,
    [_cha, _sKt],
    [[() => Channel$, 0], [() => StreamKey$, 0]]
];
var CreatePlaybackRestrictionPolicyRequest$ = [3, n0, _CPRPR,
    0,
    [_aC, _aO, _eSOE, _n, _ta],
    [64 | 0, 64 | 0, 2, 0, 128 | 0]
];
var CreatePlaybackRestrictionPolicyResponse$ = [3, n0, _CPRPRr,
    0,
    [_pRP],
    [() => PlaybackRestrictionPolicy$]
];
var CreateRecordingConfigurationRequest$ = [3, n0, _CRCR,
    0,
    [_n, _dC, _ta, _tC, _rRWS, _rC],
    [0, () => DestinationConfiguration$, 128 | 0, () => ThumbnailConfiguration$, 1, () => RenditionConfiguration$]
];
var CreateRecordingConfigurationResponse$ = [3, n0, _CRCRr,
    0,
    [_rCe],
    [() => RecordingConfiguration$]
];
var CreateStreamKeyRequest$ = [3, n0, _CSKR,
    0,
    [_cA, _ta],
    [0, 128 | 0]
];
var CreateStreamKeyResponse$ = [3, n0, _CSKRr,
    0,
    [_sKt],
    [[() => StreamKey$, 0]]
];
var DeleteChannelRequest$ = [3, n0, _DCR,
    0,
    [_a],
    [0]
];
var DeletePlaybackKeyPairRequest$ = [3, n0, _DPKPR,
    0,
    [_a],
    [0]
];
var DeletePlaybackKeyPairResponse$ = [3, n0, _DPKPRe,
    0,
    [],
    []
];
var DeletePlaybackRestrictionPolicyRequest$ = [3, n0, _DPRPR,
    0,
    [_a],
    [0]
];
var DeleteRecordingConfigurationRequest$ = [3, n0, _DRCR,
    0,
    [_a],
    [0]
];
var DeleteStreamKeyRequest$ = [3, n0, _DSKR,
    0,
    [_a],
    [0]
];
var DestinationConfiguration$ = [3, n0, _DC,
    0,
    [_s_],
    [() => S3DestinationConfiguration$]
];
var GetChannelRequest$ = [3, n0, _GCR,
    0,
    [_a],
    [0]
];
var GetChannelResponse$ = [3, n0, _GCRe,
    0,
    [_cha],
    [[() => Channel$, 0]]
];
var GetPlaybackKeyPairRequest$ = [3, n0, _GPKPR,
    0,
    [_a],
    [0]
];
var GetPlaybackKeyPairResponse$ = [3, n0, _GPKPRe,
    0,
    [_kP],
    [() => PlaybackKeyPair$]
];
var GetPlaybackRestrictionPolicyRequest$ = [3, n0, _GPRPR,
    0,
    [_a],
    [0]
];
var GetPlaybackRestrictionPolicyResponse$ = [3, n0, _GPRPRe,
    0,
    [_pRP],
    [() => PlaybackRestrictionPolicy$]
];
var GetRecordingConfigurationRequest$ = [3, n0, _GRCR,
    0,
    [_a],
    [0]
];
var GetRecordingConfigurationResponse$ = [3, n0, _GRCRe,
    0,
    [_rCe],
    [() => RecordingConfiguration$]
];
var GetStreamKeyRequest$ = [3, n0, _GSKR,
    0,
    [_a],
    [0]
];
var GetStreamKeyResponse$ = [3, n0, _GSKRe,
    0,
    [_sKt],
    [[() => StreamKey$, 0]]
];
var GetStreamRequest$ = [3, n0, _GSR,
    0,
    [_cA],
    [0]
];
var GetStreamResponse$ = [3, n0, _GSRe,
    0,
    [_st],
    [() => _Stream$]
];
var GetStreamSessionRequest$ = [3, n0, _GSSR,
    0,
    [_cA, _sI],
    [0, 0]
];
var GetStreamSessionResponse$ = [3, n0, _GSSRe,
    0,
    [_sS],
    [[() => StreamSession$, 0]]
];
var ImportPlaybackKeyPairRequest$ = [3, n0, _IPKPR,
    0,
    [_pKM, _n, _ta],
    [0, 0, 128 | 0]
];
var ImportPlaybackKeyPairResponse$ = [3, n0, _IPKPRm,
    0,
    [_kP],
    [() => PlaybackKeyPair$]
];
var IngestConfiguration$ = [3, n0, _IC,
    0,
    [_v, _aud],
    [() => VideoConfiguration$, () => AudioConfiguration$]
];
var IngestConfigurations$ = [3, n0, _ICn,
    0,
    [_vC, _aCu],
    [() => VideoConfigurationList, () => AudioConfigurationList]
];
var InternalServerException$ = [-3, n0, _ISE,
    { [_e]: _se, [_hE]: 500 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(InternalServerException$, InternalServerException);
var ListChannelsRequest$ = [3, n0, _LCR,
    0,
    [_fBN, _fBRCA, _fBPRPA, _nT, _mR],
    [0, 0, 0, 0, 1]
];
var ListChannelsResponse$ = [3, n0, _LCRi,
    0,
    [_ch, _nT],
    [() => ChannelList, 0]
];
var ListPlaybackKeyPairsRequest$ = [3, n0, _LPKPR,
    0,
    [_nT, _mR],
    [0, 1]
];
var ListPlaybackKeyPairsResponse$ = [3, n0, _LPKPRi,
    0,
    [_kPe, _nT],
    [() => PlaybackKeyPairList, 0]
];
var ListPlaybackRestrictionPoliciesRequest$ = [3, n0, _LPRPR,
    0,
    [_nT, _mR],
    [0, 1]
];
var ListPlaybackRestrictionPoliciesResponse$ = [3, n0, _LPRPRi,
    0,
    [_pRPl, _nT],
    [() => PlaybackRestrictionPolicyList, 0]
];
var ListRecordingConfigurationsRequest$ = [3, n0, _LRCR,
    0,
    [_nT, _mR],
    [0, 1]
];
var ListRecordingConfigurationsResponse$ = [3, n0, _LRCRi,
    0,
    [_rCec, _nT],
    [() => RecordingConfigurationList, 0]
];
var ListStreamKeysRequest$ = [3, n0, _LSKR,
    0,
    [_cA, _nT, _mR],
    [0, 0, 1]
];
var ListStreamKeysResponse$ = [3, n0, _LSKRi,
    0,
    [_sK, _nT],
    [() => StreamKeyList, 0]
];
var ListStreamSessionsRequest$ = [3, n0, _LSSR,
    0,
    [_cA, _nT, _mR],
    [0, 0, 1]
];
var ListStreamSessionsResponse$ = [3, n0, _LSSRi,
    0,
    [_sSt, _nT],
    [() => StreamSessionList, 0]
];
var ListStreamsRequest$ = [3, n0, _LSR,
    0,
    [_fB, _nT, _mR],
    [() => StreamFilters$, 0, 1]
];
var ListStreamsResponse$ = [3, n0, _LSRi,
    0,
    [_str, _nT],
    [() => StreamList, 0]
];
var ListTagsForResourceRequest$ = [3, n0, _LTFRR,
    0,
    [_rA],
    [[0, 1]]
];
var ListTagsForResourceResponse$ = [3, n0, _LTFRRi,
    0,
    [_ta],
    [128 | 0]
];
var MultitrackInputConfiguration$ = [3, n0, _MIC,
    0,
    [_en, _po, _mRa],
    [2, 0, 0]
];
var PendingVerification$ = [-3, n0, _PV,
    { [_e]: _c, [_hE]: 403 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(PendingVerification$, PendingVerification);
var PlaybackKeyPair$ = [3, n0, _PKP,
    0,
    [_a, _n, _f, _ta],
    [0, 0, 0, 128 | 0]
];
var PlaybackKeyPairSummary$ = [3, n0, _PKPS,
    0,
    [_a, _n, _ta],
    [0, 0, 128 | 0]
];
var PlaybackRestrictionPolicy$ = [3, n0, _PRP,
    0,
    [_a, _aC, _aO, _eSOE, _n, _ta],
    [0, 64 | 0, 64 | 0, 2, 0, 128 | 0]
];
var PlaybackRestrictionPolicySummary$ = [3, n0, _PRPS,
    0,
    [_a, _aC, _aO, _eSOE, _n, _ta],
    [0, 64 | 0, 64 | 0, 2, 0, 128 | 0]
];
var PutMetadataRequest$ = [3, n0, _PMR,
    0,
    [_cA, _me],
    [0, [() => StreamMetadata, 0]]
];
var RecordingConfiguration$ = [3, n0, _RC,
    0,
    [_a, _n, _dC, _sta, _ta, _tC, _rRWS, _rC],
    [0, 0, () => DestinationConfiguration$, 0, 128 | 0, () => ThumbnailConfiguration$, 1, () => RenditionConfiguration$]
];
var RecordingConfigurationSummary$ = [3, n0, _RCS,
    0,
    [_a, _n, _dC, _sta, _ta],
    [0, 0, () => DestinationConfiguration$, 0, 128 | 0]
];
var RenditionConfiguration$ = [3, n0, _RCe,
    0,
    [_rS, _r],
    [0, 64 | 0]
];
var ResourceNotFoundException$ = [-3, n0, _RNFE,
    { [_e]: _c, [_hE]: 404 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(ResourceNotFoundException$, ResourceNotFoundException);
var S3DestinationConfiguration$ = [3, n0, _SDC,
    0,
    [_bN],
    [0]
];
var ServiceQuotaExceededException$ = [-3, n0, _SQEE,
    { [_e]: _c, [_hE]: 402 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(ServiceQuotaExceededException$, ServiceQuotaExceededException);
var Srt$ = [3, n0, _S,
    0,
    [_end, _pa],
    [0, [() => SrtPassphrase, 0]]
];
var StartViewerSessionRevocationRequest$ = [3, n0, _SVSRR,
    0,
    [_cA, _vI, _vSVLTOET],
    [0, 0, 1]
];
var StartViewerSessionRevocationResponse$ = [3, n0, _SVSRRt,
    0,
    [],
    []
];
var StopStreamRequest$ = [3, n0, _SSR,
    0,
    [_cA],
    [0]
];
var StopStreamResponse$ = [3, n0, _SSRt,
    0,
    [],
    []
];
var _Stream$ = [3, n0, _St,
    0,
    [_cA, _sI, _pU, _sT, _sta, _h, _vCi],
    [0, 0, 0, 5, 0, 0, 1]
];
var StreamEvent$ = [3, n0, _SE,
    0,
    [_n, _ty, _eT, _cod],
    [0, 0, 5, 0]
];
var StreamFilters$ = [3, n0, _SF,
    0,
    [_h],
    [0]
];
var StreamKey$ = [3, n0, _SK,
    0,
    [_a, _va, _cA, _ta],
    [0, [() => StreamKeyValue, 0], 0, 128 | 0]
];
var StreamKeySummary$ = [3, n0, _SKS,
    0,
    [_a, _cA, _ta],
    [0, 0, 128 | 0]
];
var StreamSession$ = [3, n0, _SS,
    0,
    [_sI, _sT, _eTn, _cha, _iC, _iCn, _rCe, _tE],
    [0, 5, 5, [() => Channel$, 0], () => IngestConfiguration$, () => IngestConfigurations$, () => RecordingConfiguration$, () => StreamEvents]
];
var StreamSessionSummary$ = [3, n0, _SSS,
    0,
    [_sI, _sT, _eTn, _hEE],
    [0, 5, 5, 2]
];
var StreamSummary$ = [3, n0, _SSt,
    0,
    [_cA, _sI, _sta, _h, _vCi, _sT],
    [0, 0, 0, 0, 1, 5]
];
var StreamUnavailable$ = [-3, n0, _SU,
    { [_e]: _se, [_hE]: 503 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(StreamUnavailable$, StreamUnavailable);
var TagResourceRequest$ = [3, n0, _TRR,
    0,
    [_rA, _ta],
    [[0, 1], 128 | 0]
];
var TagResourceResponse$ = [3, n0, _TRRa,
    0,
    [],
    []
];
var ThrottlingException$ = [-3, n0, _TE,
    { [_e]: _c, [_hE]: 429 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(ThrottlingException$, ThrottlingException);
var ThumbnailConfiguration$ = [3, n0, _TC,
    0,
    [_rM, _tIS, _re, _sto],
    [0, 1, 0, 64 | 0]
];
var UntagResourceRequest$ = [3, n0, _URR,
    0,
    [_rA, _tK],
    [[0, 1], [64 | 0, { [_hQ]: _tK }]]
];
var UntagResourceResponse$ = [3, n0, _URRn,
    0,
    [],
    []
];
var UpdateChannelRequest$ = [3, n0, _UCR,
    0,
    [_a, _n, _lM, _ty, _au, _rCA, _iI, _p, _pRPA, _mIC, _cF],
    [0, 0, 0, 0, 2, 0, 2, 0, 0, () => MultitrackInputConfiguration$, 0]
];
var UpdateChannelResponse$ = [3, n0, _UCRp,
    0,
    [_cha],
    [[() => Channel$, 0]]
];
var UpdatePlaybackRestrictionPolicyRequest$ = [3, n0, _UPRPR,
    0,
    [_a, _aC, _aO, _eSOE, _n],
    [0, 64 | 0, 64 | 0, 2, 0]
];
var UpdatePlaybackRestrictionPolicyResponse$ = [3, n0, _UPRPRp,
    0,
    [_pRP],
    [() => PlaybackRestrictionPolicy$]
];
var ValidationException$ = [-3, n0, _VE,
    { [_e]: _c, [_hE]: 400 },
    [_eM],
    [0]
];
schema.TypeRegistry.for(n0).registerError(ValidationException$, ValidationException);
var VideoConfiguration$ = [3, n0, _VC,
    0,
    [_aP, _aL, _co, _enc, _tB, _tF, _vH, _vW, _l, _t, _pr],
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0]
];
var __Unit = "unit";
var IvsServiceException$ = [-3, _sm, "IvsServiceException", 0, [], []];
schema.TypeRegistry.for(_sm).registerError(IvsServiceException$, IvsServiceException);
var AudioConfigurationList = [1, n0, _ACL,
    0, () => AudioConfiguration$
];
var BatchErrors = [1, n0, _BEa,
    0, () => BatchError$
];
var BatchStartViewerSessionRevocationErrors = [1, n0, _BSVSREa,
    0, () => BatchStartViewerSessionRevocationError$
];
var BatchStartViewerSessionRevocationViewerSessionList = [1, n0, _BSVSRVSL,
    0, () => BatchStartViewerSessionRevocationViewerSession$
];
var ChannelList = [1, n0, _CL,
    0, () => ChannelSummary$
];
var Channels = [1, n0, _Ch,
    0, [() => Channel$,
        0]
];
var PlaybackKeyPairList = [1, n0, _PKPL,
    0, () => PlaybackKeyPairSummary$
];
var PlaybackRestrictionPolicyList = [1, n0, _PRPL,
    0, () => PlaybackRestrictionPolicySummary$
];
var RecordingConfigurationList = [1, n0, _RCL,
    0, () => RecordingConfigurationSummary$
];
var StreamEvents = [1, n0, _SEt,
    0, () => StreamEvent$
];
var StreamKeyList = [1, n0, _SKL,
    0, () => StreamKeySummary$
];
var StreamKeys = [1, n0, _SKt,
    0, [() => StreamKey$,
        0]
];
var StreamList = [1, n0, _SL,
    0, () => StreamSummary$
];
var StreamSessionList = [1, n0, _SSL,
    0, () => StreamSessionSummary$
];
var VideoConfigurationList = [1, n0, _VCL,
    0, () => VideoConfiguration$
];
var BatchGetChannel$ = [9, n0, _BGC,
    { [_ht]: ["POST", "/BatchGetChannel", 200] }, () => BatchGetChannelRequest$, () => BatchGetChannelResponse$
];
var BatchGetStreamKey$ = [9, n0, _BGSK,
    { [_ht]: ["POST", "/BatchGetStreamKey", 200] }, () => BatchGetStreamKeyRequest$, () => BatchGetStreamKeyResponse$
];
var BatchStartViewerSessionRevocation$ = [9, n0, _BSVSR,
    { [_ht]: ["POST", "/BatchStartViewerSessionRevocation", 200] }, () => BatchStartViewerSessionRevocationRequest$, () => BatchStartViewerSessionRevocationResponse$
];
var CreateChannel$ = [9, n0, _CC,
    { [_ht]: ["POST", "/CreateChannel", 200] }, () => CreateChannelRequest$, () => CreateChannelResponse$
];
var CreatePlaybackRestrictionPolicy$ = [9, n0, _CPRP,
    { [_ht]: ["POST", "/CreatePlaybackRestrictionPolicy", 200] }, () => CreatePlaybackRestrictionPolicyRequest$, () => CreatePlaybackRestrictionPolicyResponse$
];
var CreateRecordingConfiguration$ = [9, n0, _CRC,
    { [_ht]: ["POST", "/CreateRecordingConfiguration", 200] }, () => CreateRecordingConfigurationRequest$, () => CreateRecordingConfigurationResponse$
];
var CreateStreamKey$ = [9, n0, _CSK,
    { [_ht]: ["POST", "/CreateStreamKey", 200] }, () => CreateStreamKeyRequest$, () => CreateStreamKeyResponse$
];
var DeleteChannel$ = [9, n0, _DCe,
    { [_ht]: ["POST", "/DeleteChannel", 204] }, () => DeleteChannelRequest$, () => __Unit
];
var DeletePlaybackKeyPair$ = [9, n0, _DPKP,
    { [_ht]: ["POST", "/DeletePlaybackKeyPair", 200] }, () => DeletePlaybackKeyPairRequest$, () => DeletePlaybackKeyPairResponse$
];
var DeletePlaybackRestrictionPolicy$ = [9, n0, _DPRP,
    { [_ht]: ["POST", "/DeletePlaybackRestrictionPolicy", 204] }, () => DeletePlaybackRestrictionPolicyRequest$, () => __Unit
];
var DeleteRecordingConfiguration$ = [9, n0, _DRC,
    { [_ht]: ["POST", "/DeleteRecordingConfiguration", 204] }, () => DeleteRecordingConfigurationRequest$, () => __Unit
];
var DeleteStreamKey$ = [9, n0, _DSK,
    { [_ht]: ["POST", "/DeleteStreamKey", 204] }, () => DeleteStreamKeyRequest$, () => __Unit
];
var GetChannel$ = [9, n0, _GC,
    { [_ht]: ["POST", "/GetChannel", 200] }, () => GetChannelRequest$, () => GetChannelResponse$
];
var GetPlaybackKeyPair$ = [9, n0, _GPKP,
    { [_ht]: ["POST", "/GetPlaybackKeyPair", 200] }, () => GetPlaybackKeyPairRequest$, () => GetPlaybackKeyPairResponse$
];
var GetPlaybackRestrictionPolicy$ = [9, n0, _GPRP,
    { [_ht]: ["POST", "/GetPlaybackRestrictionPolicy", 200] }, () => GetPlaybackRestrictionPolicyRequest$, () => GetPlaybackRestrictionPolicyResponse$
];
var GetRecordingConfiguration$ = [9, n0, _GRC,
    { [_ht]: ["POST", "/GetRecordingConfiguration", 200] }, () => GetRecordingConfigurationRequest$, () => GetRecordingConfigurationResponse$
];
var GetStream$ = [9, n0, _GS,
    { [_ht]: ["POST", "/GetStream", 200] }, () => GetStreamRequest$, () => GetStreamResponse$
];
var GetStreamKey$ = [9, n0, _GSK,
    { [_ht]: ["POST", "/GetStreamKey", 200] }, () => GetStreamKeyRequest$, () => GetStreamKeyResponse$
];
var GetStreamSession$ = [9, n0, _GSS,
    { [_ht]: ["POST", "/GetStreamSession", 200] }, () => GetStreamSessionRequest$, () => GetStreamSessionResponse$
];
var ImportPlaybackKeyPair$ = [9, n0, _IPKP,
    { [_ht]: ["POST", "/ImportPlaybackKeyPair", 200] }, () => ImportPlaybackKeyPairRequest$, () => ImportPlaybackKeyPairResponse$
];
var ListChannels$ = [9, n0, _LC,
    { [_ht]: ["POST", "/ListChannels", 200] }, () => ListChannelsRequest$, () => ListChannelsResponse$
];
var ListPlaybackKeyPairs$ = [9, n0, _LPKP,
    { [_ht]: ["POST", "/ListPlaybackKeyPairs", 200] }, () => ListPlaybackKeyPairsRequest$, () => ListPlaybackKeyPairsResponse$
];
var ListPlaybackRestrictionPolicies$ = [9, n0, _LPRP,
    { [_ht]: ["POST", "/ListPlaybackRestrictionPolicies", 200] }, () => ListPlaybackRestrictionPoliciesRequest$, () => ListPlaybackRestrictionPoliciesResponse$
];
var ListRecordingConfigurations$ = [9, n0, _LRC,
    { [_ht]: ["POST", "/ListRecordingConfigurations", 200] }, () => ListRecordingConfigurationsRequest$, () => ListRecordingConfigurationsResponse$
];
var ListStreamKeys$ = [9, n0, _LSK,
    { [_ht]: ["POST", "/ListStreamKeys", 200] }, () => ListStreamKeysRequest$, () => ListStreamKeysResponse$
];
var ListStreams$ = [9, n0, _LS,
    { [_ht]: ["POST", "/ListStreams", 200] }, () => ListStreamsRequest$, () => ListStreamsResponse$
];
var ListStreamSessions$ = [9, n0, _LSS,
    { [_ht]: ["POST", "/ListStreamSessions", 200] }, () => ListStreamSessionsRequest$, () => ListStreamSessionsResponse$
];
var ListTagsForResource$ = [9, n0, _LTFR,
    { [_ht]: ["GET", "/tags/{resourceArn}", 200] }, () => ListTagsForResourceRequest$, () => ListTagsForResourceResponse$
];
var PutMetadata$ = [9, n0, _PM,
    { [_ht]: ["POST", "/PutMetadata", 204] }, () => PutMetadataRequest$, () => __Unit
];
var StartViewerSessionRevocation$ = [9, n0, _SVSR,
    { [_ht]: ["POST", "/StartViewerSessionRevocation", 200] }, () => StartViewerSessionRevocationRequest$, () => StartViewerSessionRevocationResponse$
];
var StopStream$ = [9, n0, _SSto,
    { [_ht]: ["POST", "/StopStream", 200] }, () => StopStreamRequest$, () => StopStreamResponse$
];
var TagResource$ = [9, n0, _TR,
    { [_ht]: ["POST", "/tags/{resourceArn}", 200] }, () => TagResourceRequest$, () => TagResourceResponse$
];
var UntagResource$ = [9, n0, _UR,
    { [_ht]: ["DELETE", "/tags/{resourceArn}", 200] }, () => UntagResourceRequest$, () => UntagResourceResponse$
];
var UpdateChannel$ = [9, n0, _UC,
    { [_ht]: ["POST", "/UpdateChannel", 200] }, () => UpdateChannelRequest$, () => UpdateChannelResponse$
];
var UpdatePlaybackRestrictionPolicy$ = [9, n0, _UPRP,
    { [_ht]: ["POST", "/UpdatePlaybackRestrictionPolicy", 200] }, () => UpdatePlaybackRestrictionPolicyRequest$, () => UpdatePlaybackRestrictionPolicyResponse$
];

class BatchGetChannelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "BatchGetChannel", {})
    .n("IvsClient", "BatchGetChannelCommand")
    .sc(BatchGetChannel$)
    .build() {
}

class BatchGetStreamKeyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "BatchGetStreamKey", {})
    .n("IvsClient", "BatchGetStreamKeyCommand")
    .sc(BatchGetStreamKey$)
    .build() {
}

class BatchStartViewerSessionRevocationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "BatchStartViewerSessionRevocation", {})
    .n("IvsClient", "BatchStartViewerSessionRevocationCommand")
    .sc(BatchStartViewerSessionRevocation$)
    .build() {
}

class CreateChannelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "CreateChannel", {})
    .n("IvsClient", "CreateChannelCommand")
    .sc(CreateChannel$)
    .build() {
}

class CreatePlaybackRestrictionPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "CreatePlaybackRestrictionPolicy", {})
    .n("IvsClient", "CreatePlaybackRestrictionPolicyCommand")
    .sc(CreatePlaybackRestrictionPolicy$)
    .build() {
}

class CreateRecordingConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "CreateRecordingConfiguration", {})
    .n("IvsClient", "CreateRecordingConfigurationCommand")
    .sc(CreateRecordingConfiguration$)
    .build() {
}

class CreateStreamKeyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "CreateStreamKey", {})
    .n("IvsClient", "CreateStreamKeyCommand")
    .sc(CreateStreamKey$)
    .build() {
}

class DeleteChannelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeleteChannel", {})
    .n("IvsClient", "DeleteChannelCommand")
    .sc(DeleteChannel$)
    .build() {
}

class DeletePlaybackKeyPairCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeletePlaybackKeyPair", {})
    .n("IvsClient", "DeletePlaybackKeyPairCommand")
    .sc(DeletePlaybackKeyPair$)
    .build() {
}

class DeletePlaybackRestrictionPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeletePlaybackRestrictionPolicy", {})
    .n("IvsClient", "DeletePlaybackRestrictionPolicyCommand")
    .sc(DeletePlaybackRestrictionPolicy$)
    .build() {
}

class DeleteRecordingConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeleteRecordingConfiguration", {})
    .n("IvsClient", "DeleteRecordingConfigurationCommand")
    .sc(DeleteRecordingConfiguration$)
    .build() {
}

class DeleteStreamKeyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeleteStreamKey", {})
    .n("IvsClient", "DeleteStreamKeyCommand")
    .sc(DeleteStreamKey$)
    .build() {
}

class GetChannelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetChannel", {})
    .n("IvsClient", "GetChannelCommand")
    .sc(GetChannel$)
    .build() {
}

class GetPlaybackKeyPairCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetPlaybackKeyPair", {})
    .n("IvsClient", "GetPlaybackKeyPairCommand")
    .sc(GetPlaybackKeyPair$)
    .build() {
}

class GetPlaybackRestrictionPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetPlaybackRestrictionPolicy", {})
    .n("IvsClient", "GetPlaybackRestrictionPolicyCommand")
    .sc(GetPlaybackRestrictionPolicy$)
    .build() {
}

class GetRecordingConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetRecordingConfiguration", {})
    .n("IvsClient", "GetRecordingConfigurationCommand")
    .sc(GetRecordingConfiguration$)
    .build() {
}

class GetStreamCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetStream", {})
    .n("IvsClient", "GetStreamCommand")
    .sc(GetStream$)
    .build() {
}

class GetStreamKeyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetStreamKey", {})
    .n("IvsClient", "GetStreamKeyCommand")
    .sc(GetStreamKey$)
    .build() {
}

class GetStreamSessionCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetStreamSession", {})
    .n("IvsClient", "GetStreamSessionCommand")
    .sc(GetStreamSession$)
    .build() {
}

class ImportPlaybackKeyPairCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ImportPlaybackKeyPair", {})
    .n("IvsClient", "ImportPlaybackKeyPairCommand")
    .sc(ImportPlaybackKeyPair$)
    .build() {
}

class ListChannelsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListChannels", {})
    .n("IvsClient", "ListChannelsCommand")
    .sc(ListChannels$)
    .build() {
}

class ListPlaybackKeyPairsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListPlaybackKeyPairs", {})
    .n("IvsClient", "ListPlaybackKeyPairsCommand")
    .sc(ListPlaybackKeyPairs$)
    .build() {
}

class ListPlaybackRestrictionPoliciesCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListPlaybackRestrictionPolicies", {})
    .n("IvsClient", "ListPlaybackRestrictionPoliciesCommand")
    .sc(ListPlaybackRestrictionPolicies$)
    .build() {
}

class ListRecordingConfigurationsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListRecordingConfigurations", {})
    .n("IvsClient", "ListRecordingConfigurationsCommand")
    .sc(ListRecordingConfigurations$)
    .build() {
}

class ListStreamKeysCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListStreamKeys", {})
    .n("IvsClient", "ListStreamKeysCommand")
    .sc(ListStreamKeys$)
    .build() {
}

class ListStreamsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListStreams", {})
    .n("IvsClient", "ListStreamsCommand")
    .sc(ListStreams$)
    .build() {
}

class ListStreamSessionsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListStreamSessions", {})
    .n("IvsClient", "ListStreamSessionsCommand")
    .sc(ListStreamSessions$)
    .build() {
}

class ListTagsForResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ListTagsForResource", {})
    .n("IvsClient", "ListTagsForResourceCommand")
    .sc(ListTagsForResource$)
    .build() {
}

class PutMetadataCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "PutMetadata", {})
    .n("IvsClient", "PutMetadataCommand")
    .sc(PutMetadata$)
    .build() {
}

class StartViewerSessionRevocationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "StartViewerSessionRevocation", {})
    .n("IvsClient", "StartViewerSessionRevocationCommand")
    .sc(StartViewerSessionRevocation$)
    .build() {
}

class StopStreamCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "StopStream", {})
    .n("IvsClient", "StopStreamCommand")
    .sc(StopStream$)
    .build() {
}

class TagResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "TagResource", {})
    .n("IvsClient", "TagResourceCommand")
    .sc(TagResource$)
    .build() {
}

class UntagResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "UntagResource", {})
    .n("IvsClient", "UntagResourceCommand")
    .sc(UntagResource$)
    .build() {
}

class UpdateChannelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "UpdateChannel", {})
    .n("IvsClient", "UpdateChannelCommand")
    .sc(UpdateChannel$)
    .build() {
}

class UpdatePlaybackRestrictionPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "UpdatePlaybackRestrictionPolicy", {})
    .n("IvsClient", "UpdatePlaybackRestrictionPolicyCommand")
    .sc(UpdatePlaybackRestrictionPolicy$)
    .build() {
}

const commands = {
    BatchGetChannelCommand,
    BatchGetStreamKeyCommand,
    BatchStartViewerSessionRevocationCommand,
    CreateChannelCommand,
    CreatePlaybackRestrictionPolicyCommand,
    CreateRecordingConfigurationCommand,
    CreateStreamKeyCommand,
    DeleteChannelCommand,
    DeletePlaybackKeyPairCommand,
    DeletePlaybackRestrictionPolicyCommand,
    DeleteRecordingConfigurationCommand,
    DeleteStreamKeyCommand,
    GetChannelCommand,
    GetPlaybackKeyPairCommand,
    GetPlaybackRestrictionPolicyCommand,
    GetRecordingConfigurationCommand,
    GetStreamCommand,
    GetStreamKeyCommand,
    GetStreamSessionCommand,
    ImportPlaybackKeyPairCommand,
    ListChannelsCommand,
    ListPlaybackKeyPairsCommand,
    ListPlaybackRestrictionPoliciesCommand,
    ListRecordingConfigurationsCommand,
    ListStreamKeysCommand,
    ListStreamsCommand,
    ListStreamSessionsCommand,
    ListTagsForResourceCommand,
    PutMetadataCommand,
    StartViewerSessionRevocationCommand,
    StopStreamCommand,
    TagResourceCommand,
    UntagResourceCommand,
    UpdateChannelCommand,
    UpdatePlaybackRestrictionPolicyCommand,
};
class Ivs extends IvsClient {
}
smithyClient.createAggregatedClient(commands, Ivs);

const paginateListChannels = core.createPaginator(IvsClient, ListChannelsCommand, "nextToken", "nextToken", "maxResults");

const paginateListPlaybackKeyPairs = core.createPaginator(IvsClient, ListPlaybackKeyPairsCommand, "nextToken", "nextToken", "maxResults");

const paginateListPlaybackRestrictionPolicies = core.createPaginator(IvsClient, ListPlaybackRestrictionPoliciesCommand, "nextToken", "nextToken", "maxResults");

const paginateListRecordingConfigurations = core.createPaginator(IvsClient, ListRecordingConfigurationsCommand, "nextToken", "nextToken", "maxResults");

const paginateListStreamKeys = core.createPaginator(IvsClient, ListStreamKeysCommand, "nextToken", "nextToken", "maxResults");

const paginateListStreams = core.createPaginator(IvsClient, ListStreamsCommand, "nextToken", "nextToken", "maxResults");

const paginateListStreamSessions = core.createPaginator(IvsClient, ListStreamSessionsCommand, "nextToken", "nextToken", "maxResults");

const ContainerFormat = {
    FragmentedMP4: "FRAGMENTED_MP4",
    TS: "TS",
};
const ChannelLatencyMode = {
    LowLatency: "LOW",
    NormalLatency: "NORMAL",
};
const MultitrackMaximumResolution = {
    FULL_HD: "FULL_HD",
    HD: "HD",
    SD: "SD",
};
const MultitrackPolicy = {
    ALLOW: "ALLOW",
    REQUIRE: "REQUIRE",
};
const TranscodePreset = {
    ConstrainedBandwidthTranscodePreset: "CONSTRAINED_BANDWIDTH_DELIVERY",
    HigherBandwidthTranscodePreset: "HIGHER_BANDWIDTH_DELIVERY",
};
const ChannelType = {
    AdvancedHDChannelType: "ADVANCED_HD",
    AdvancedSDChannelType: "ADVANCED_SD",
    BasicChannelType: "BASIC",
    StandardChannelType: "STANDARD",
};
const RenditionConfigurationRendition = {
    FULL_HD: "FULL_HD",
    HD: "HD",
    LOWEST_RESOLUTION: "LOWEST_RESOLUTION",
    SD: "SD",
};
const RenditionConfigurationRenditionSelection = {
    ALL: "ALL",
    CUSTOM: "CUSTOM",
    NONE: "NONE",
};
const RecordingMode = {
    Disabled: "DISABLED",
    Interval: "INTERVAL",
};
const ThumbnailConfigurationResolution = {
    FULL_HD: "FULL_HD",
    HD: "HD",
    LOWEST_RESOLUTION: "LOWEST_RESOLUTION",
    SD: "SD",
};
const ThumbnailConfigurationStorage = {
    LATEST: "LATEST",
    SEQUENTIAL: "SEQUENTIAL",
};
const RecordingConfigurationState = {
    Active: "ACTIVE",
    CreateFailed: "CREATE_FAILED",
    Creating: "CREATING",
};
const StreamHealth = {
    Starving: "STARVING",
    StreamHealthy: "HEALTHY",
    Unknown: "UNKNOWN",
};
const StreamState = {
    StreamLive: "LIVE",
    StreamOffline: "OFFLINE",
};

Object.defineProperty(exports, "$Command", {
    enumerable: true,
    get: function () { return smithyClient.Command; }
});
Object.defineProperty(exports, "__Client", {
    enumerable: true,
    get: function () { return smithyClient.Client; }
});
exports.AccessDeniedException = AccessDeniedException;
exports.AccessDeniedException$ = AccessDeniedException$;
exports.AudioConfiguration$ = AudioConfiguration$;
exports.BatchError$ = BatchError$;
exports.BatchGetChannel$ = BatchGetChannel$;
exports.BatchGetChannelCommand = BatchGetChannelCommand;
exports.BatchGetChannelRequest$ = BatchGetChannelRequest$;
exports.BatchGetChannelResponse$ = BatchGetChannelResponse$;
exports.BatchGetStreamKey$ = BatchGetStreamKey$;
exports.BatchGetStreamKeyCommand = BatchGetStreamKeyCommand;
exports.BatchGetStreamKeyRequest$ = BatchGetStreamKeyRequest$;
exports.BatchGetStreamKeyResponse$ = BatchGetStreamKeyResponse$;
exports.BatchStartViewerSessionRevocation$ = BatchStartViewerSessionRevocation$;
exports.BatchStartViewerSessionRevocationCommand = BatchStartViewerSessionRevocationCommand;
exports.BatchStartViewerSessionRevocationError$ = BatchStartViewerSessionRevocationError$;
exports.BatchStartViewerSessionRevocationRequest$ = BatchStartViewerSessionRevocationRequest$;
exports.BatchStartViewerSessionRevocationResponse$ = BatchStartViewerSessionRevocationResponse$;
exports.BatchStartViewerSessionRevocationViewerSession$ = BatchStartViewerSessionRevocationViewerSession$;
exports.Channel$ = Channel$;
exports.ChannelLatencyMode = ChannelLatencyMode;
exports.ChannelNotBroadcasting = ChannelNotBroadcasting;
exports.ChannelNotBroadcasting$ = ChannelNotBroadcasting$;
exports.ChannelSummary$ = ChannelSummary$;
exports.ChannelType = ChannelType;
exports.ConflictException = ConflictException;
exports.ConflictException$ = ConflictException$;
exports.ContainerFormat = ContainerFormat;
exports.CreateChannel$ = CreateChannel$;
exports.CreateChannelCommand = CreateChannelCommand;
exports.CreateChannelRequest$ = CreateChannelRequest$;
exports.CreateChannelResponse$ = CreateChannelResponse$;
exports.CreatePlaybackRestrictionPolicy$ = CreatePlaybackRestrictionPolicy$;
exports.CreatePlaybackRestrictionPolicyCommand = CreatePlaybackRestrictionPolicyCommand;
exports.CreatePlaybackRestrictionPolicyRequest$ = CreatePlaybackRestrictionPolicyRequest$;
exports.CreatePlaybackRestrictionPolicyResponse$ = CreatePlaybackRestrictionPolicyResponse$;
exports.CreateRecordingConfiguration$ = CreateRecordingConfiguration$;
exports.CreateRecordingConfigurationCommand = CreateRecordingConfigurationCommand;
exports.CreateRecordingConfigurationRequest$ = CreateRecordingConfigurationRequest$;
exports.CreateRecordingConfigurationResponse$ = CreateRecordingConfigurationResponse$;
exports.CreateStreamKey$ = CreateStreamKey$;
exports.CreateStreamKeyCommand = CreateStreamKeyCommand;
exports.CreateStreamKeyRequest$ = CreateStreamKeyRequest$;
exports.CreateStreamKeyResponse$ = CreateStreamKeyResponse$;
exports.DeleteChannel$ = DeleteChannel$;
exports.DeleteChannelCommand = DeleteChannelCommand;
exports.DeleteChannelRequest$ = DeleteChannelRequest$;
exports.DeletePlaybackKeyPair$ = DeletePlaybackKeyPair$;
exports.DeletePlaybackKeyPairCommand = DeletePlaybackKeyPairCommand;
exports.DeletePlaybackKeyPairRequest$ = DeletePlaybackKeyPairRequest$;
exports.DeletePlaybackKeyPairResponse$ = DeletePlaybackKeyPairResponse$;
exports.DeletePlaybackRestrictionPolicy$ = DeletePlaybackRestrictionPolicy$;
exports.DeletePlaybackRestrictionPolicyCommand = DeletePlaybackRestrictionPolicyCommand;
exports.DeletePlaybackRestrictionPolicyRequest$ = DeletePlaybackRestrictionPolicyRequest$;
exports.DeleteRecordingConfiguration$ = DeleteRecordingConfiguration$;
exports.DeleteRecordingConfigurationCommand = DeleteRecordingConfigurationCommand;
exports.DeleteRecordingConfigurationRequest$ = DeleteRecordingConfigurationRequest$;
exports.DeleteStreamKey$ = DeleteStreamKey$;
exports.DeleteStreamKeyCommand = DeleteStreamKeyCommand;
exports.DeleteStreamKeyRequest$ = DeleteStreamKeyRequest$;
exports.DestinationConfiguration$ = DestinationConfiguration$;
exports.GetChannel$ = GetChannel$;
exports.GetChannelCommand = GetChannelCommand;
exports.GetChannelRequest$ = GetChannelRequest$;
exports.GetChannelResponse$ = GetChannelResponse$;
exports.GetPlaybackKeyPair$ = GetPlaybackKeyPair$;
exports.GetPlaybackKeyPairCommand = GetPlaybackKeyPairCommand;
exports.GetPlaybackKeyPairRequest$ = GetPlaybackKeyPairRequest$;
exports.GetPlaybackKeyPairResponse$ = GetPlaybackKeyPairResponse$;
exports.GetPlaybackRestrictionPolicy$ = GetPlaybackRestrictionPolicy$;
exports.GetPlaybackRestrictionPolicyCommand = GetPlaybackRestrictionPolicyCommand;
exports.GetPlaybackRestrictionPolicyRequest$ = GetPlaybackRestrictionPolicyRequest$;
exports.GetPlaybackRestrictionPolicyResponse$ = GetPlaybackRestrictionPolicyResponse$;
exports.GetRecordingConfiguration$ = GetRecordingConfiguration$;
exports.GetRecordingConfigurationCommand = GetRecordingConfigurationCommand;
exports.GetRecordingConfigurationRequest$ = GetRecordingConfigurationRequest$;
exports.GetRecordingConfigurationResponse$ = GetRecordingConfigurationResponse$;
exports.GetStream$ = GetStream$;
exports.GetStreamCommand = GetStreamCommand;
exports.GetStreamKey$ = GetStreamKey$;
exports.GetStreamKeyCommand = GetStreamKeyCommand;
exports.GetStreamKeyRequest$ = GetStreamKeyRequest$;
exports.GetStreamKeyResponse$ = GetStreamKeyResponse$;
exports.GetStreamRequest$ = GetStreamRequest$;
exports.GetStreamResponse$ = GetStreamResponse$;
exports.GetStreamSession$ = GetStreamSession$;
exports.GetStreamSessionCommand = GetStreamSessionCommand;
exports.GetStreamSessionRequest$ = GetStreamSessionRequest$;
exports.GetStreamSessionResponse$ = GetStreamSessionResponse$;
exports.ImportPlaybackKeyPair$ = ImportPlaybackKeyPair$;
exports.ImportPlaybackKeyPairCommand = ImportPlaybackKeyPairCommand;
exports.ImportPlaybackKeyPairRequest$ = ImportPlaybackKeyPairRequest$;
exports.ImportPlaybackKeyPairResponse$ = ImportPlaybackKeyPairResponse$;
exports.IngestConfiguration$ = IngestConfiguration$;
exports.IngestConfigurations$ = IngestConfigurations$;
exports.InternalServerException = InternalServerException;
exports.InternalServerException$ = InternalServerException$;
exports.Ivs = Ivs;
exports.IvsClient = IvsClient;
exports.IvsServiceException = IvsServiceException;
exports.IvsServiceException$ = IvsServiceException$;
exports.ListChannels$ = ListChannels$;
exports.ListChannelsCommand = ListChannelsCommand;
exports.ListChannelsRequest$ = ListChannelsRequest$;
exports.ListChannelsResponse$ = ListChannelsResponse$;
exports.ListPlaybackKeyPairs$ = ListPlaybackKeyPairs$;
exports.ListPlaybackKeyPairsCommand = ListPlaybackKeyPairsCommand;
exports.ListPlaybackKeyPairsRequest$ = ListPlaybackKeyPairsRequest$;
exports.ListPlaybackKeyPairsResponse$ = ListPlaybackKeyPairsResponse$;
exports.ListPlaybackRestrictionPolicies$ = ListPlaybackRestrictionPolicies$;
exports.ListPlaybackRestrictionPoliciesCommand = ListPlaybackRestrictionPoliciesCommand;
exports.ListPlaybackRestrictionPoliciesRequest$ = ListPlaybackRestrictionPoliciesRequest$;
exports.ListPlaybackRestrictionPoliciesResponse$ = ListPlaybackRestrictionPoliciesResponse$;
exports.ListRecordingConfigurations$ = ListRecordingConfigurations$;
exports.ListRecordingConfigurationsCommand = ListRecordingConfigurationsCommand;
exports.ListRecordingConfigurationsRequest$ = ListRecordingConfigurationsRequest$;
exports.ListRecordingConfigurationsResponse$ = ListRecordingConfigurationsResponse$;
exports.ListStreamKeys$ = ListStreamKeys$;
exports.ListStreamKeysCommand = ListStreamKeysCommand;
exports.ListStreamKeysRequest$ = ListStreamKeysRequest$;
exports.ListStreamKeysResponse$ = ListStreamKeysResponse$;
exports.ListStreamSessions$ = ListStreamSessions$;
exports.ListStreamSessionsCommand = ListStreamSessionsCommand;
exports.ListStreamSessionsRequest$ = ListStreamSessionsRequest$;
exports.ListStreamSessionsResponse$ = ListStreamSessionsResponse$;
exports.ListStreams$ = ListStreams$;
exports.ListStreamsCommand = ListStreamsCommand;
exports.ListStreamsRequest$ = ListStreamsRequest$;
exports.ListStreamsResponse$ = ListStreamsResponse$;
exports.ListTagsForResource$ = ListTagsForResource$;
exports.ListTagsForResourceCommand = ListTagsForResourceCommand;
exports.ListTagsForResourceRequest$ = ListTagsForResourceRequest$;
exports.ListTagsForResourceResponse$ = ListTagsForResourceResponse$;
exports.MultitrackInputConfiguration$ = MultitrackInputConfiguration$;
exports.MultitrackMaximumResolution = MultitrackMaximumResolution;
exports.MultitrackPolicy = MultitrackPolicy;
exports.PendingVerification = PendingVerification;
exports.PendingVerification$ = PendingVerification$;
exports.PlaybackKeyPair$ = PlaybackKeyPair$;
exports.PlaybackKeyPairSummary$ = PlaybackKeyPairSummary$;
exports.PlaybackRestrictionPolicy$ = PlaybackRestrictionPolicy$;
exports.PlaybackRestrictionPolicySummary$ = PlaybackRestrictionPolicySummary$;
exports.PutMetadata$ = PutMetadata$;
exports.PutMetadataCommand = PutMetadataCommand;
exports.PutMetadataRequest$ = PutMetadataRequest$;
exports.RecordingConfiguration$ = RecordingConfiguration$;
exports.RecordingConfigurationState = RecordingConfigurationState;
exports.RecordingConfigurationSummary$ = RecordingConfigurationSummary$;
exports.RecordingMode = RecordingMode;
exports.RenditionConfiguration$ = RenditionConfiguration$;
exports.RenditionConfigurationRendition = RenditionConfigurationRendition;
exports.RenditionConfigurationRenditionSelection = RenditionConfigurationRenditionSelection;
exports.ResourceNotFoundException = ResourceNotFoundException;
exports.ResourceNotFoundException$ = ResourceNotFoundException$;
exports.S3DestinationConfiguration$ = S3DestinationConfiguration$;
exports.ServiceQuotaExceededException = ServiceQuotaExceededException;
exports.ServiceQuotaExceededException$ = ServiceQuotaExceededException$;
exports.Srt$ = Srt$;
exports.StartViewerSessionRevocation$ = StartViewerSessionRevocation$;
exports.StartViewerSessionRevocationCommand = StartViewerSessionRevocationCommand;
exports.StartViewerSessionRevocationRequest$ = StartViewerSessionRevocationRequest$;
exports.StartViewerSessionRevocationResponse$ = StartViewerSessionRevocationResponse$;
exports.StopStream$ = StopStream$;
exports.StopStreamCommand = StopStreamCommand;
exports.StopStreamRequest$ = StopStreamRequest$;
exports.StopStreamResponse$ = StopStreamResponse$;
exports.StreamEvent$ = StreamEvent$;
exports.StreamFilters$ = StreamFilters$;
exports.StreamHealth = StreamHealth;
exports.StreamKey$ = StreamKey$;
exports.StreamKeySummary$ = StreamKeySummary$;
exports.StreamSession$ = StreamSession$;
exports.StreamSessionSummary$ = StreamSessionSummary$;
exports.StreamState = StreamState;
exports.StreamSummary$ = StreamSummary$;
exports.StreamUnavailable = StreamUnavailable;
exports.StreamUnavailable$ = StreamUnavailable$;
exports.TagResource$ = TagResource$;
exports.TagResourceCommand = TagResourceCommand;
exports.TagResourceRequest$ = TagResourceRequest$;
exports.TagResourceResponse$ = TagResourceResponse$;
exports.ThrottlingException = ThrottlingException;
exports.ThrottlingException$ = ThrottlingException$;
exports.ThumbnailConfiguration$ = ThumbnailConfiguration$;
exports.ThumbnailConfigurationResolution = ThumbnailConfigurationResolution;
exports.ThumbnailConfigurationStorage = ThumbnailConfigurationStorage;
exports.TranscodePreset = TranscodePreset;
exports.UntagResource$ = UntagResource$;
exports.UntagResourceCommand = UntagResourceCommand;
exports.UntagResourceRequest$ = UntagResourceRequest$;
exports.UntagResourceResponse$ = UntagResourceResponse$;
exports.UpdateChannel$ = UpdateChannel$;
exports.UpdateChannelCommand = UpdateChannelCommand;
exports.UpdateChannelRequest$ = UpdateChannelRequest$;
exports.UpdateChannelResponse$ = UpdateChannelResponse$;
exports.UpdatePlaybackRestrictionPolicy$ = UpdatePlaybackRestrictionPolicy$;
exports.UpdatePlaybackRestrictionPolicyCommand = UpdatePlaybackRestrictionPolicyCommand;
exports.UpdatePlaybackRestrictionPolicyRequest$ = UpdatePlaybackRestrictionPolicyRequest$;
exports.UpdatePlaybackRestrictionPolicyResponse$ = UpdatePlaybackRestrictionPolicyResponse$;
exports.ValidationException = ValidationException;
exports.ValidationException$ = ValidationException$;
exports.VideoConfiguration$ = VideoConfiguration$;
exports._Stream$ = _Stream$;
exports.paginateListChannels = paginateListChannels;
exports.paginateListPlaybackKeyPairs = paginateListPlaybackKeyPairs;
exports.paginateListPlaybackRestrictionPolicies = paginateListPlaybackRestrictionPolicies;
exports.paginateListRecordingConfigurations = paginateListRecordingConfigurations;
exports.paginateListStreamKeys = paginateListStreamKeys;
exports.paginateListStreamSessions = paginateListStreamSessions;
exports.paginateListStreams = paginateListStreams;
