package com.example.agent.tools

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import java.io.File
import java.io.FileOutputStream

class CameraCaptureActivity : ComponentActivity() {

    companion object {
        var photoResultDeferred: CompletableDeferred<String>? = null
    }

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            launchCamera()
        } else {
            Toast.makeText(this, "Camera permission denied", Toast.LENGTH_SHORT).show()
            photoResultDeferred?.complete("Error: Camera permission denied.")
            finish()
        }
    }

    private val takePhotoLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap: Bitmap? ->
        if (bitmap != null) {
            try {
                val file = File(cacheDir, "captured_photo_${System.currentTimeMillis()}.png")
                val out = FileOutputStream(file)
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                out.flush()
                out.close()
                Toast.makeText(this, "Photo saved successfully", Toast.LENGTH_SHORT).show()
                photoResultDeferred?.complete("Success: Photo saved to ${file.absolutePath}")
            } catch (e: Exception) {
                Toast.makeText(this, "Failed to save photo", Toast.LENGTH_SHORT).show()
                photoResultDeferred?.complete("Error: Failed to save photo: ${e.message}")
            }
        } else {
            Toast.makeText(this, "Photo capture cancelled", Toast.LENGTH_SHORT).show()
            photoResultDeferred?.complete("Error: Photo capture cancelled or failed.")
        }
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera()
        } else {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    private fun launchCamera() {
        try {
            takePhotoLauncher.launch(null)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "No camera app found", Toast.LENGTH_SHORT).show()
            photoResultDeferred?.complete("Error: No camera app found on device.")
            finish()
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to launch camera", Toast.LENGTH_SHORT).show()
            photoResultDeferred?.complete("Error: Failed to launch camera: ${e.message}")
            finish()
        }
    }
}
