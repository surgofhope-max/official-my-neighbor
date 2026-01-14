import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { UpdatePlaybackRestrictionPolicy$ } from "../schemas/schemas_0";
export { $Command };
export class UpdatePlaybackRestrictionPolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "UpdatePlaybackRestrictionPolicy", {})
    .n("IvsClient", "UpdatePlaybackRestrictionPolicyCommand")
    .sc(UpdatePlaybackRestrictionPolicy$)
    .build() {
}
