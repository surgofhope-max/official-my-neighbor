import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreatePlaybackRestrictionPolicy$ } from "../schemas/schemas_0";
export { $Command };
export class CreatePlaybackRestrictionPolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "CreatePlaybackRestrictionPolicy", {})
    .n("IvsClient", "CreatePlaybackRestrictionPolicyCommand")
    .sc(CreatePlaybackRestrictionPolicy$)
    .build() {
}
