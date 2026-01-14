import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { IvsClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../IvsClient";
import type { GetStreamKeyRequest, GetStreamKeyResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetStreamKeyCommand}.
 */
export interface GetStreamKeyCommandInput extends GetStreamKeyRequest {
}
/**
 * @public
 *
 * The output of {@link GetStreamKeyCommand}.
 */
export interface GetStreamKeyCommandOutput extends GetStreamKeyResponse, __MetadataBearer {
}
declare const GetStreamKeyCommand_base: {
    new (input: GetStreamKeyCommandInput): import("@smithy/smithy-client").CommandImpl<GetStreamKeyCommandInput, GetStreamKeyCommandOutput, IvsClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetStreamKeyCommandInput): import("@smithy/smithy-client").CommandImpl<GetStreamKeyCommandInput, GetStreamKeyCommandOutput, IvsClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Gets stream-key information for a specified ARN.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { IvsClient, GetStreamKeyCommand } from "@aws-sdk/client-ivs"; // ES Modules import
 * // const { IvsClient, GetStreamKeyCommand } = require("@aws-sdk/client-ivs"); // CommonJS import
 * // import type { IvsClientConfig } from "@aws-sdk/client-ivs";
 * const config = {}; // type is IvsClientConfig
 * const client = new IvsClient(config);
 * const input = { // GetStreamKeyRequest
 *   arn: "STRING_VALUE", // required
 * };
 * const command = new GetStreamKeyCommand(input);
 * const response = await client.send(command);
 * // { // GetStreamKeyResponse
 * //   streamKey: { // StreamKey
 * //     arn: "STRING_VALUE",
 * //     value: "STRING_VALUE",
 * //     channelArn: "STRING_VALUE",
 * //     tags: { // Tags
 * //       "<keys>": "STRING_VALUE",
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param GetStreamKeyCommandInput - {@link GetStreamKeyCommandInput}
 * @returns {@link GetStreamKeyCommandOutput}
 * @see {@link GetStreamKeyCommandInput} for command's `input` shape.
 * @see {@link GetStreamKeyCommandOutput} for command's `response` shape.
 * @see {@link IvsClientResolvedConfig | config} for IvsClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p/>
 *
 * @throws {@link ResourceNotFoundException} (client fault)
 *  <p/>
 *
 * @throws {@link ValidationException} (client fault)
 *  <p/>
 *
 * @throws {@link IvsServiceException}
 * <p>Base exception class for all service exceptions from Ivs service.</p>
 *
 *
 * @public
 */
export declare class GetStreamKeyCommand extends GetStreamKeyCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetStreamKeyRequest;
            output: GetStreamKeyResponse;
        };
        sdk: {
            input: GetStreamKeyCommandInput;
            output: GetStreamKeyCommandOutput;
        };
    };
}
