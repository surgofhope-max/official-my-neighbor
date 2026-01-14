import { ExceptionOptionType as __ExceptionOptionType } from "@smithy/smithy-client";
import { IvsServiceException as __BaseException } from "./IvsServiceException";
export declare class AccessDeniedException extends __BaseException {
  readonly name: "AccessDeniedException";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<AccessDeniedException, __BaseException>
  );
}
export declare class PendingVerification extends __BaseException {
  readonly name: "PendingVerification";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<PendingVerification, __BaseException>
  );
}
export declare class ThrottlingException extends __BaseException {
  readonly name: "ThrottlingException";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<ThrottlingException, __BaseException>
  );
}
export declare class ValidationException extends __BaseException {
  readonly name: "ValidationException";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<ValidationException, __BaseException>
  );
}
export declare class ResourceNotFoundException extends __BaseException {
  readonly name: "ResourceNotFoundException";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<ResourceNotFoundException, __BaseException>
  );
}
export declare class ServiceQuotaExceededException extends __BaseException {
  readonly name: "ServiceQuotaExceededException";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<ServiceQuotaExceededException, __BaseException>
  );
}
export declare class ConflictException extends __BaseException {
  readonly name: "ConflictException";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
}
export declare class InternalServerException extends __BaseException {
  readonly name: "InternalServerException";
  readonly $fault: "server";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<InternalServerException, __BaseException>
  );
}
export declare class ChannelNotBroadcasting extends __BaseException {
  readonly name: "ChannelNotBroadcasting";
  readonly $fault: "client";
  exceptionMessage?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<ChannelNotBroadcasting, __BaseException>
  );
}
export declare class StreamUnavailable extends __BaseException {
  readonly name: "StreamUnavailable";
  readonly $fault: "server";
  exceptionMessage?: string | undefined;
  constructor(opts: __ExceptionOptionType<StreamUnavailable, __BaseException>);
}
