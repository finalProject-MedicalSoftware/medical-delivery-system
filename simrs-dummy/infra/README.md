# Infrastructure

Untuk tahap awal, PostgreSQL SIMRS dijalankan dari `compose.yaml` di root agar satu perintah bisa digunakan dari workspace utama. Folder ini disediakan untuk konfigurasi tambahan nanti (misalnya konfigurasi database monitoring yang terpisah, Kafka setelah kontraknya jelas, dan tooling observability). Hindari menambahkan Kafka sebelum kebutuhan event lintas layanan dirumuskan.
