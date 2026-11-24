import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

guard #available(macOS 14.0, *), CommandLine.arguments.count == 4 else {
    fputs("macOS 14 이상에서 자동 분리를 사용할 수 있습니다.\n", stderr)
    exit(1)
}
do {
    let input = URL(fileURLWithPath: CommandLine.arguments[1])
    let handler = VNImageRequestHandler(url: input)
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty,
          let source = CIImage(contentsOf: input) else {
        throw NSError(domain: "ImageLayer", code: 1, userInfo: [NSLocalizedDescriptionKey: "분리할 전경 대상을 찾지 못했습니다. 직접 영역을 선택해 주세요."])
    }
    let mask = CIImage(cvPixelBuffer: try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler))
    let clear = CIImage(color: .clear).cropped(to: source.extent)
    let foreground = source.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: mask])
    let inverted = mask.applyingFilter("CIColorInvert")
    let background = source.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: inverted])
    let context = CIContext()
    for (image, output) in [(foreground, CommandLine.arguments[2]), (background, CommandLine.arguments[3])] {
        guard let cg = context.createCGImage(image, from: source.extent),
              let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: output) as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw NSError(domain: "ImageLayer", code: 2, userInfo: [NSLocalizedDescriptionKey: "분리된 이미지를 저장하지 못했습니다."])
        }
        CGImageDestinationAddImage(destination, cg, nil)
        guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "ImageLayer", code: 3) }
    }
} catch {
    fputs("\(error.localizedDescription)\n", stderr)
    exit(1)
}
