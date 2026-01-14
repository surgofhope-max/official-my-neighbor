import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeletePlaybackKeyPair$ } from "../schemas/schemas_0";
export { $Command };
export class DeletePlaybackKeyPairCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeletePlaybackKeyPair", {})
    .n("IvsClient", "DeletePlaybackKeyPairCommand")
    .sc(DeletePlaybackKeyPair$)
    .build() {
}
