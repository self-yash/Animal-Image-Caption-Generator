# 🐾 Animal Image Caption Generator

A simple web application that generates natural language captions for animal images using a pretrained vision–language model.

The project is built with **Flask** and runs on a self-hosted virtual machine.

---

## 🚀 Features

- Upload an image (JPG / PNG)
- Automatically generates a descriptive caption
- Lightweight and easy to deploy
- Uses a pretrained BLIP image captioning model
- CPU-only inference (no GPU required)

---

## 🛠 Tech Stack

- **Backend:** Flask (Python)
- **Model:** BLIP Image Captioning (Transformers)
- **Inference:** PyTorch (CPU)
- **Image Processing:** Pillow

---

## 🖥 Deployment

The application is currently hosted on a self-managed virtual machine with:

- **2 vCPU**
- **8 GB RAM**
- **CPU-only inference**

---

## 📌 How It Works

1. User uploads an image via the web interface  
2. The image is processed and passed to the BLIP model  
3. The model generates a caption describing the image  
4. The caption is returned and displayed to the user  

---

## 📄 License

This project is licensed under the **MIT License**.

The BLIP model is provided by **Salesforce** and is subject to its own license.

---

## 🙌 Acknowledgements

- [Salesforce BLIP](https://huggingface.co/Salesforce/blip-image-captioning-base)
- Hugging Face Transformers
- PyTorch
