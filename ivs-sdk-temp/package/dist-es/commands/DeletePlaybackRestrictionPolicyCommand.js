import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeletePlaybackRestrictionPolicy$ } from "../schemas/schemas_0";
export { $Command };
export class DeletePlaybackRestrictionPolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeletePlaybackRestrictionPolicy", {})
    .n("IvsClient", "DeletePlaybackRestrictionPolicyCommand")
    .sc(DeletePlaybackRestrictionPolicy$)
    .build() {
}
