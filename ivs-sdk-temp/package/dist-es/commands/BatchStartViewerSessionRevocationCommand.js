import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { BatchStartViewerSessionRevocation$ } from "../schemas/schemas_0";
export { $Command };
export class BatchStartViewerSessionRevocationCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "BatchStartViewerSessionRevocation", {})
    .n("IvsClient", "BatchStartViewerSessionRevocationCommand")
    .sc(BatchStartViewerSessionRevocation$)
    .build() {
}
