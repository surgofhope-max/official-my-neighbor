import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetPlaybackRestrictionPolicy$ } from "../schemas/schemas_0";
export { $Command };
export class GetPlaybackRestrictionPolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetPlaybackRestrictionPolicy", {})
    .n("IvsClient", "GetPlaybackRestrictionPolicyCommand")
    .sc(GetPlaybackRestrictionPolicy$)
    .build() {
}
