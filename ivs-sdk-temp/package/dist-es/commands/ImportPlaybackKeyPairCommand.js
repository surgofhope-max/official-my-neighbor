import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ImportPlaybackKeyPair$ } from "../schemas/schemas_0";
export { $Command };
export class ImportPlaybackKeyPairCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "ImportPlaybackKeyPair", {})
    .n("IvsClient", "ImportPlaybackKeyPairCommand")
    .sc(ImportPlaybackKeyPair$)
    .build() {
}
