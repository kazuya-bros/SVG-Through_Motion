"""Transport alpha through exactly the RGB model's final grids and blend mask.

Only used after verifying the audited model hash. Weights and RGB output stay
unchanged. The derived graph exists in memory, never as a second model file.
"""
from ._onnx_schema import ModelProto


def with_alpha_output(data):
    model = ModelProto()
    model.ParseFromString(data)
    nodes = {node.name: node for node in model.graph.node}
    for index in (12, 13):
        if nodes.get(f'/net/GridSample_{index}') is None:
            raise ValueError('RIFEの透過処理に対応していないモデルです')
    for name in ('svg_alpha0', 'svg_alpha1'):
        value = model.graph.input.add()
        value.CopyFrom(model.graph.input[0])
        value.name = name
        value.type.tensor_type.shape.dim[1].ClearField('dim_param')
        value.type.tensor_type.shape.dim[1].dim_value = 1
    for i, index in enumerate((12, 13)):
        original = nodes[f'/net/GridSample_{index}']
        node = model.graph.node.add()
        node.CopyFrom(original)
        node.name = f'svg_alpha_warp_{i}'
        node.input[0] = f'svg_alpha{i}'
        node.output[0] = f'svg_alpha_warp_{i}_out'
        product = model.graph.node.add()
        product.name = f'svg_alpha_mix_{i}'
        product.op_type = 'Mul'
        product.input.extend([node.output[0], '/net/Sigmoid_output_0' if i == 0 else '/net/Sub_9_output_0'])
        product.output.append(f'svg_alpha_mix_{i}_out')
    node = model.graph.node.add()
    node.name = 'svg_alpha_result'
    node.op_type = 'Add'
    node.input.extend(['svg_alpha_mix_0_out', 'svg_alpha_mix_1_out'])
    node.output.append('svg_alpha_output')
    value = model.graph.output.add()
    value.CopyFrom(model.graph.input[-1])
    value.name = 'svg_alpha_output'
    return model.SerializeToString()
