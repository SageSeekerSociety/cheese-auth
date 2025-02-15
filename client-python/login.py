import requests
import sys

def login_user(base_url, username, password):
    url = f"{base_url}/users/auth/login"
    payload = {
        "username": username,
        "password": password
    }
    headers = {
        "Content-Type": "application/json"
    }
    response = requests.post(url, json=payload, headers=headers)
    return response.json()

if __name__ == "__main__":
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
    username = input("Enter username: ")
    password = input("Enter password: ")

    result = login_user(base_url, username, password)
    print(result)
