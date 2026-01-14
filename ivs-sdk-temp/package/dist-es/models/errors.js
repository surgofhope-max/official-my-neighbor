import { IvsServiceException as __BaseException } from "./IvsServiceException";
export class AccessDeniedException extends __BaseException {
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
export class PendingVerification extends __BaseException {
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
export class ThrottlingException extends __BaseException {
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
export class ValidationException extends __BaseException {
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
export class ResourceNotFoundException extends __BaseException {
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
export class ServiceQuotaExceededException extends __BaseException {
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
export class ConflictException extends __BaseException {
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
export class InternalServerException extends __BaseException {
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
export class ChannelNotBroadcasting extends __BaseException {
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
export class StreamUnavailable extends __BaseException {
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
