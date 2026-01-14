import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import {
  UpdatePlaybackRestrictionPolicyRequest,
  UpdatePlaybackRestrictionPolicyResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface UpdatePlaybackRestrictionPolicyCommandInput
  extends UpdatePlaybackRestrictionPolicyRequest {}
export interface UpdatePlaybackRestrictionPolicyCommandOutput
  extends UpdatePlaybackRestrictionPolicyResponse,
    __MetadataBearer {}
declare const UpdatePlaybackRestrictionPolicyCommand_base: {
  new (
    input: UpdatePlaybackRestrictionPolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdatePlaybackRestrictionPolicyCommandInput,
    UpdatePlaybackRestrictionPolicyCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdatePlaybackRestrictionPolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdatePlaybackRestrictionPolicyCommandInput,
    UpdatePlaybackRestrictionPolicyCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdatePlaybackRestrictionPolicyCommand extends UpdatePlaybackRestrictionPolicyCommand_base {
  protected static __types: {
    api: {
      input: UpdatePlaybackRestrictionPolicyRequest;
      output: UpdatePlaybackRestrictionPolicyResponse;
    };
    sdk: {
      input: UpdatePlaybackRestrictionPolicyCommandInput;
      output: UpdatePlaybackRestrictionPolicyCommandOutput;
    };
  };
}
