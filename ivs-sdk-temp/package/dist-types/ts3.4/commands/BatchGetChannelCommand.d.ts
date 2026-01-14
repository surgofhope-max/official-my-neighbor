import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import {
  BatchGetChannelRequest,
  BatchGetChannelResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface BatchGetChannelCommandInput extends BatchGetChannelRequest {}
export interface BatchGetChannelCommandOutput
  extends BatchGetChannelResponse,
    __MetadataBearer {}
declare const BatchGetChannelCommand_base: {
  new (
    input: BatchGetChannelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    BatchGetChannelCommandInput,
    BatchGetChannelCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: BatchGetChannelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    BatchGetChannelCommandInput,
    BatchGetChannelCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class BatchGetChannelCommand extends BatchGetChannelCommand_base {
  protected static __types: {
    api: {
      input: BatchGetChannelRequest;
      output: BatchGetChannelResponse;
    };
    sdk: {
      input: BatchGetChannelCommandInput;
      output: BatchGetChannelCommandOutput;
    };
  };
}
