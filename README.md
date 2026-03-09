# Voucher Management System

## Installation on Docker Desktop for Windows

This guide will help you run the Voucher Management System using Docker Desktop on Windows.

### Prerequisites

1.  **Docker Desktop**: Ensure Docker Desktop is installed and running on your Windows machine.
2.  **Node.js** (Optional, for local dev): Version 20 or higher is required.
3.  **Git** (Optional): To clone the repository.

### Steps to Run

1.  **Open PowerShell or Command Prompt** and navigate to the project directory.

2.  **Build and Start the Container**:
    Run the following command to build the Docker image and start the container in the background:
    ```bash
    docker-compose up --build -d
    ```
    *Note: The first build might take a few minutes as it installs dependencies and compiles the database driver.*

3.  **Access the Application**:
    Once the container is running, open your web browser and go to:
    ```
    http://localhost:3000
    ```

4.  **Stop the Application**:
    To stop the application, run:
    ```bash
    docker-compose down
    ```

### Data Persistence

-   The application uses a **Docker Volume** named `vouchers_data` to store the SQLite database.
-   This ensures that your data (vouchers, users, logs) persists even if you stop or remove the container.
-   To reset the database completely, you can remove the volume:
    ```bash
    docker volume rm react-example_vouchers_data
    ```
    *(Note: The volume name might vary slightly depending on your directory name, check with `docker volume ls`)*

### Troubleshooting

-   **Port Conflicts**: If port `3000` is already in use, modify `docker-compose.yml` to map a different port (e.g., `"8080:3000"`).
-   **Database Errors**: If you encounter database errors, ensure the `vouchers_data` volume is correctly mounted. You can check container logs with:
    ```bash
    docker-compose logs -f
    ```
