import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import { DeleteStreamKeyRequest } from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteStreamKeyCommandInput extends DeleteStreamKeyRequest {}
export interface DeleteStreamKeyCommandOutput extends __MetadataBearer {}
declare const DeleteStreamKeyCommand_base: {
  new (
    input: DeleteStreamKeyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteStreamKeyCommandInput,
    DeleteStreamKeyCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteStreamKeyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteStreamKeyCommandInput,
    DeleteStreamKeyCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteStreamKeyCommand extends DeleteStreamKeyCommand_base {
  protected static __types: {
    api: {
      input: DeleteStreamKeyRequest;
      output: {};
    };
    sdk: {
      input: DeleteStreamKeyCommandInput;
      output: DeleteStreamKeyCommandOutput;
    };
  };
}
