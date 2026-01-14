import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  IvsClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../IvsClient";
import {
  ListPlaybackRestrictionPoliciesRequest,
  ListPlaybackRestrictionPoliciesResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListPlaybackRestrictionPoliciesCommandInput
  extends ListPlaybackRestrictionPoliciesRequest {}
export interface ListPlaybackRestrictionPoliciesCommandOutput
  extends ListPlaybackRestrictionPoliciesResponse,
    __MetadataBearer {}
declare const ListPlaybackRestrictionPoliciesCommand_base: {
  new (
    input: ListPlaybackRestrictionPoliciesCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListPlaybackRestrictionPoliciesCommandInput,
    ListPlaybackRestrictionPoliciesCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListPlaybackRestrictionPoliciesCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListPlaybackRestrictionPoliciesCommandInput,
    ListPlaybackRestrictionPoliciesCommandOutput,
    IvsClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListPlaybackRestrictionPoliciesCommand extends ListPlaybackRestrictionPoliciesCommand_base {
  protected static __types: {
    api: {
      input: ListPlaybackRestrictionPoliciesRequest;
      output: ListPlaybackRestrictionPoliciesResponse;
    };
    sdk: {
      input: ListPlaybackRestrictionPoliciesCommandInput;
      output: ListPlaybackRestrictionPoliciesCommandOutput;
    };
  };
}
