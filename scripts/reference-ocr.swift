import AppKit
import Foundation
import Vision

struct Candidate: Encodable {
    let text: String
    let confidence: Float
    let language: String
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct FrameResult: Encodable {
    let candidates: [Candidate]
    let error: Bool
}

let files = Array(CommandLine.arguments.dropFirst())
guard !files.isEmpty && files.count <= 8 else { exit(2) }
let results: [FrameResult] = files.map { file in
    do {
        guard let image = NSImage(contentsOfFile: file),
              let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            throw NSError(domain: "image", code: 1)
        }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        let supported = try request.supportedRecognitionLanguages()
        let languages = ["ko-KR", "en-US"].filter { supported.contains($0) }
        if !languages.isEmpty { request.recognitionLanguages = languages }
        try VNImageRequestHandler(cgImage: cgImage).perform([request])
        let candidates: [Candidate] = (request.results ?? []).compactMap { observation in
            guard let match = observation.topCandidates(1).first, match.confidence >= 0.2 else { return nil }
            let text = String(match.string.prefix(120)).replacingOccurrences(of: "\n", with: " ")
            guard !text.isEmpty else { return nil }
            let hasHangul = text.unicodeScalars.contains { (0xAC00...0xD7A3).contains($0.value) }
            let box = observation.boundingBox
            return Candidate(text: text, confidence: match.confidence,
                             language: hasHangul ? "한국어 추정" : "영문 등 추정",
                             x: box.origin.x, y: 1 - box.origin.y - box.height,
                             width: box.width, height: box.height)
        }
        return FrameResult(candidates: Array(candidates.prefix(3)), error: false)
    } catch {
        return FrameResult(candidates: [], error: true)
    }
}
let data = try JSONEncoder().encode(results)
FileHandle.standardOutput.write(data)
