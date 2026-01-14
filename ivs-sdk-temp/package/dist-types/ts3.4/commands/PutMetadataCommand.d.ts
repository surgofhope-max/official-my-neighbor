import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import { PutMetadataRequest } from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface PutMetadataCommandInput extends PutMetadataRequest {}
export interface PutMetadataCommandOutput extends __MetadataBearer {}
declare const PutMetadataCommand_base: {
  new (
    input: PutMetadataCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutMetadataCommandInput,
    PutMetadataCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: PutMetadataCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutMetadataCommandInput,
    PutMetadataCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class PutMetadataCommand extends PutMetadataCommand_base {
  protected static __types: {
    api: {
      input: PutMetadataRequest;
      output: {};
    };
    sdk: {
      input: PutMetadataCommandInput;
      output: PutMetadataCommandOutput;
    };
  };
}
