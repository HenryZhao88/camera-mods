import Foundation
import CoreMediaIO

// Entry point for the camera system extension: start the CMIO provider service
// and run forever. (Xcode's "Camera Extension" template generates a main.swift
// like this — keep whichever the template provides; this is the reference.)
let providerSource = CameraExtensionProviderSource(clientQueue: nil)
CMIOExtensionProvider.startService(provider: providerSource.provider)
CFRunLoopRun()
