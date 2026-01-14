import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import {
  ImportPlaybackKeyPairRequest,
  ImportPlaybackKeyPairResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ImportPlaybackKeyPairCommandInput
  extends ImportPlaybackKeyPairRequest {}
export interface ImportPlaybackKeyPairCommandOutput
  extends ImportPlaybackKeyPairResponse,
    __MetadataBearer {}
declare const ImportPlaybackKeyPairCommand_base: {
  new (
    input: ImportPlaybackKeyPairCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ImportPlaybackKeyPairCommandInput,
    ImportPlaybackKeyPairCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: ImportPlaybackKeyPairCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ImportPlaybackKeyPairCommandInput,
    ImportPlaybackKeyPairCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ImportPlaybackKeyPairCommand extends ImportPlaybackKeyPairCommand_base {
  protected static __types: {
    api: {
      input: ImportPlaybackKeyPairRequest;
      output: ImportPlaybackKeyPairResponse;
    };
    sdk: {
      input: ImportPlaybackKeyPairCommandInput;
      output: ImportPlaybackKeyPairCommandOutput;
    };
  };
}
