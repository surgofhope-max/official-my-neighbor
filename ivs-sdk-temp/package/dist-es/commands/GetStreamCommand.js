import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetStream$ } from "../schemas/schemas_0";
export { $Command };
export class GetStreamCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetStream", {})
    .n("IvsClient", "GetStreamCommand")
    .sc(GetStream$)
    .build() {
}
