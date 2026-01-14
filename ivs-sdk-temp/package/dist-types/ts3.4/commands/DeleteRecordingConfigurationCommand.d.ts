import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import { DeleteRecordingConfigurationRequest } from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteRecordingConfigurationCommandInput
  extends DeleteRecordingConfigurationRequest {}
export interface DeleteRecordingConfigurationCommandOutput
  extends __MetadataBearer {}
declare const DeleteRecordingConfigurationCommand_base: {
  new (
    input: DeleteRecordingConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteRecordingConfigurationCommandInput,
    DeleteRecordingConfigurationCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteRecordingConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteRecordingConfigurationCommandInput,
    DeleteRecordingConfigurationCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteRecordingConfigurationCommand extends DeleteRecordingConfigurationCommand_base {
  protected static __types: {
    api: {
      input: DeleteRecordingConfigurationRequest;
      output: {};
    };
    sdk: {
      input: DeleteRecordingConfigurationCommandInput;
      output: DeleteRecordingConfigurationCommandOutput;
    };
  };
}
