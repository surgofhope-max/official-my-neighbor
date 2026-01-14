import type { ExceptionOptionType as __ExceptionOptionType } from "@smithy/smithy-client";
import { IvsServiceException as __BaseException } from "./IvsServiceException";
/**
 * <p/>
 * @public
 */
export declare class AccessDeniedException extends __BaseException {
    readonly name: "AccessDeniedException";
    readonly $fault: "client";
    /**
     * <p>User does not have sufficient access to perform this action.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<AccessDeniedException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class PendingVerification extends __BaseException {
    readonly name: "PendingVerification";
    readonly $fault: "client";
    /**
     * <p> Your account is pending verification. </p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<PendingVerification, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class ThrottlingException extends __BaseException {
    readonly name: "ThrottlingException";
    readonly $fault: "client";
    /**
     * <p>Request was denied due to request throttling.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ThrottlingException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class ValidationException extends __BaseException {
    readonly name: "ValidationException";
    readonly $fault: "client";
    /**
     * <p>The input fails to satisfy the constraints specified by an Amazon Web Services service.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ValidationException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class ResourceNotFoundException extends __BaseException {
    readonly name: "ResourceNotFoundException";
    readonly $fault: "client";
    /**
     * <p>Request references a resource which does not exist.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ResourceNotFoundException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class ServiceQuotaExceededException extends __BaseException {
    readonly name: "ServiceQuotaExceededException";
    readonly $fault: "client";
    /**
     * <p>Request would cause a service quota to be exceeded.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ServiceQuotaExceededException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class ConflictException extends __BaseException {
    readonly name: "ConflictException";
    readonly $fault: "client";
    /**
     * <p>Updating or deleting a resource can cause an inconsistent state.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class InternalServerException extends __BaseException {
    readonly name: "InternalServerException";
    readonly $fault: "server";
    /**
     * <p>Unexpected error during processing of request.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<InternalServerException, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class ChannelNotBroadcasting extends __BaseException {
    readonly name: "ChannelNotBroadcasting";
    readonly $fault: "client";
    /**
     * <p>The stream is offline for the given channel ARN.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ChannelNotBroadcasting, __BaseException>);
}
/**
 * <p/>
 * @public
 */
export declare class StreamUnavailable extends __BaseException {
    readonly name: "StreamUnavailable";
    readonly $fault: "server";
    /**
     * <p>The stream is temporarily unavailable.</p>
     * @public
     */
    exceptionMessage?: string | undefined;
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<StreamUnavailable, __BaseException>);
}
