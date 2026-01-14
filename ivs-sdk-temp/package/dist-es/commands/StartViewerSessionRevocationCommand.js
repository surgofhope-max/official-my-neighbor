import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { StartViewerSessionRevocation$ } from "../schemas/schemas_0";
export { $Command };
export class StartViewerSessionRevocationCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "StartViewerSessionRevocation", {})
    .n("IvsClient", "StartViewerSessionRevocationCommand")
    .sc(StartViewerSessionRevocation$)
    .build() {
}
