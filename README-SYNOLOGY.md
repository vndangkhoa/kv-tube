<h1 align="center">🖥️ KV-Tube on Synology NAS</h1>

<p align="center">
  <strong>A beginner-friendly, step-by-step installation guide</strong><br/>
  <sub>No terminal needed · ~15 minutes · Copy & paste friendly</sub>
</p>

<p align="center">
  🌐 <b>Language / Ngôn ngữ:</b>
  <a href="#-what-is-kv-tube"><b>🇬🇧 English</b></a> •
  <a href="#tieng-viet"><b>🇻🇳 Tiếng Việt</b></a>
</p>

---

# 🇬🇧 English

## 📖 What is KV-Tube?

KV-Tube is your own **private YouTube**, running on your Synology NAS.

After setup, you open a website in your browser (hosted by your own NAS) where you can:

- 🔍 Search and watch any YouTube video
- 🔔 Subscribe to channels and get a personal feed
- 🚫 Watch **without ads** and skip sponsored segments automatically
- 📜 Keep your watch history saved on **your** NAS — not on Google's servers

You do **not** need any programming knowledge. If you can use File Station and click buttons, you can do this. 😊

---

## ✅ Before You Start — Checklist

Please check these 4 things first:

| # | What you need | How to check |
|---|---------------|--------------|
| 1 | A Synology NAS running **DSM 7.2 or newer** | Control Panel → Info Center → DSM Version |
| 2 | **Container Manager** installed | Package Center → search "Container Manager" → Install |
| 3 | At least **5 GB free space** on a volume | Storage Manager |
| 4 | You know your **NAS IP address** | Control Panel → Info Center → Network (e.g. `192.168.1.10`) |

> 💡 **What is Container Manager?**
> It's the official Synology app for running Docker containers (small self-contained apps).
> Think of it as an "app store runner" — KV-Tube runs inside it.

---

## 🧩 What Am I Installing? (Plain Words)

The setup uses **one recipe file** (`docker-compose.yml`) that downloads and starts **4 small apps** working together:

| App | What it does (in plain words) |
|-----|-------------------------------|
| **KV-Tube** | The website you actually watch on |
| **Invidious** | The middleman that talks to YouTube for you (no ads, no tracking) |
| **PostgreSQL** | A small database that remembers your subscriptions and history |
| **Companion** | A helper that unlocks the actual video streams |

You don't need to understand them deeply — the recipe file handles everything.

---

## 🚀 Installation — 6 Easy Steps

### Step 1 — Create a folder

1. Open **File Station**
2. Go to the shared folder called `docker`
   - *Don't have one?* → Control Panel → Shared Folder → Create → name it `docker`
3. Inside `docker`, create a new folder named **`kv-tube`**

Your path should look like: `/docker/kv-tube`

---

### Step 2 — Download the recipe file

1. Download this file to your computer:
   👉 [`docker-compose.yml`](https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml)
   *(Click the link → right-click the page → Save As → keep the name exactly `docker-compose.yml`)*
2. Drag & drop it into your `/docker/kv-tube` folder in File Station

> 💡 This file is just a "recipe": it tells your NAS which 4 apps to download, how to connect them, and which doors (ports) to open.

---

### Step 3 — Edit 2 small things in the file ⚠️ (important!)

Open `docker-compose.yml` with a text editor (double-click in File Station, or use Notepad/VS Code) and change **2 values**:

**① Replace `127.0.0.1` with your NAS IP** (found in the checklist above)

Find this line:
```yaml
      - NEXT_PUBLIC_INVIDIOUS_URL=http://127.0.0.1:7601
```
Change it to (example):
```yaml
      - NEXT_PUBLIC_INVIDIOUS_URL=http://192.168.1.10:7601
```

*Why?* `127.0.0.1` means "this device". Without this change, videos will play on the NAS itself but **fail on your phone/laptop**.

**② (Optional, LAN-only users can skip)** If you plan to open this to the internet later, also replace the author's domains (`yt.khoavo.myds.me`, `youtube.khoavo.myds.me`) with your own DDNS name. For home/LAN use, leaving them is fine.

Save the file.

---

### Step 4 — Create the project in Container Manager

1. Open **Container Manager** (from the main menu)
2. Left menu → **Project** → click **Create**
3. Fill in:
   - **Project name:** `kv-tube`
   - **Path:** click *Set path* → choose `/docker/kv-tube`
   - **Source:** select **Upload docker-compose.yml** → pick your edited file
4. Click **Next**

---

### Step 5 — Build and wait ☕

1. The next screens show a summary and some options — you can safely click **Next** through them
   *(Skip the "Web portal" step — you don't need it)*
2. Click **Done**
3. Container Manager now **downloads the 4 apps and starts them** (takes 1–3 minutes)
4. Wait until all 4 containers show **green / Running**:
   - ✅ `Invidious-Materialious-UI`
   - ✅ `Invidious`
   - ✅ `Invidious-DB`
   - ✅ `Invidious-COMPANION`

> ⏳ First start is slow — the database needs to prepare itself. Give it up to 2 minutes after everything turns green.

---

### Step 6 — Open your private YouTube! 🎉

In any browser on your home network, go to:

```
http://YOUR-NAS-IP:3241
```

Example: `http://192.168.1.10:3241`

You should see the KV-Tube homepage. Search for a video and press play!

---

## 📱 Bonus: Install It Like a Real App

On your **phone or tablet**, open the same address in Chrome (Android) or Safari (iPhone):

- **Android:** Menu ⋮ → *Add to Home screen*
- **iPhone:** Share button → *Add to Home Screen*

Now KV-Tube opens full-screen like a native app, with background audio support. 🎧

There are also **native Android apps** (phone + Android TV) — see the [main README](README.md#-native-apps-mobile--tv).

---

## 🔄 How to Update Later (Get New Features)

When a new version is released:

1. Open **Container Manager** → **Project** → `kv-tube`
2. Click **Stop**, then **Action → Build**
   *(Container Manager re-downloads the latest images during build)*
3. When finished, click **Start**

Your watch history and subscriptions are **safe** — they are stored in `/docker/kv-tube/data` and won't be deleted.

*(Comfortable with SSH? One-liner instead: `cd /volume1/docker/kv-tube && sudo docker compose pull && sudo docker compose up -d`)*

---

## 🩺 Something Not Working? Common Fixes

### ❗ Problem 1: `Invidious` container keeps stopping (red)

Log mentions *"permission denied"*.

**Cause:** the file contains `user: 1026:100` — that's the author's NAS account ID, yours is different.

**Fix:**
1. Enable SSH: Control Panel → Terminal & SNMP → enable SSH
2. Connect: open Terminal/PowerShell on your PC → `ssh YOUR-DSM-USER@NAS-IP` → type `id`
3. Note the numbers shown, e.g. `uid=1026(user)` and `gid=100(users)`
4. In `docker-compose.yml`, find the line `user: 1026:100` and replace with **your** numbers
5. Project → Stop → Build again

### ❗ Problem 2: "Port already in use" error

Another app is using port 3241 or 7601.

**Fix:** in `docker-compose.yml`, change only the **left** number:
```yaml
    ports:
      - "8241:3000"     # was "3241:3000"
```
Then remember your new address: `http://NAS-IP:8241`

### ❗ Problem 3: Website loads, but videos won't play on my phone/PC

You skipped **Step 3①** — go back and replace `127.0.0.1` with your NAS IP, then Project → Stop → Build.

### ❗ Problem 4: Videos worked before, broken today

YouTube changes things on their side regularly.

**Fix:** restart the stack: Container Manager → Project → `kv-tube` → **Restart**. If still broken, do an **update** (section above) — newer versions usually include the fix.

### 🆘 Still stuck?

Open an issue: https://github.com/vndangkhoa/kv-tube/issues

---

## 🔒 Optional Next Steps (Not Required)

- 🌍 **Access from outside home (HTTPS):** see [main README — Reverse Proxy section](README.md)
- 📦 **Native Package Center install (.spk):** see [KV-Tube SPK](https://github.com/vndangkhoa/synology-spk)

---
---

# 🇻🇳 Tiếng Việt

<h2 align="center" id="tieng-viet">📖 KV-Tube là gì?</h2>

KV-Tube là **YouTube riêng tư của bạn**, chạy ngay trên NAS Synology.

Sau khi cài xong, bạn mở một trang web (do chính NAS của bạn phục vụ) để:

- 🔍 Tìm và xem bất kỳ video YouTube nào
- 🔔 Đăng ký kênh và có bảng tin cá nhân
- 🚫 Xem **không quảng cáo**, tự động bỏ qua các đoạn tài trợ
- 📜 Lịch sử xem được lưu trên NAS **của bạn** — không phải trên máy chủ Google

Bạn **không cần biết lập trình**. Nếu biết dùng File Station và bấm nút, là bạn làm được. 😊

---

## ✅ Trước khi bắt đầu — Danh sách kiểm tra

Kiểm tra 4 điều sau trước nhé:

| # | Cần có | Cách kiểm tra |
|---|--------|---------------|
| 1 | NAS Synology chạy **DSM 7.2 trở lên** | Control Panel → Info Center → DSM Version |
| 2 | Đã cài **Container Manager** | Trung tâm gói → tìm "Container Manager" → Cài đặt |
| 3 | Volume còn trống ít nhất **5 GB** | Storage Manager |
| 4 | Biết **địa chỉ IP của NAS** | Control Panel → Info Center → Network (vd `192.168.1.10`) |

> 💡 **Container Manager là gì?**
> Là ứng dụng chính thức của Synology để chạy các Docker container (những ứng dụng nhỏ đóng gói sẵn).
> Hãy nghĩ nó như "trình chạy kho ứng dụng" — KV-Tube chạy bên trong đó.

---

## 🧩 Mình đang cài những gì?

Toàn bộ dùng **một file công thức** (`docker-compose.yml`) để tải về và khởi động **4 ứng dụng nhỏ** phối hợp với nhau:

| Ứng dụng | Nó làm gì (nói dễ hiểu) |
|----------|--------------------------|
| **KV-Tube** | Trang web bạn trực tiếp xem video |
| **Invidious** | "Người môi giới" thay bạn nói chuyện với YouTube (không quảng cáo, không theo dõi) |
| **PostgreSQL** | Cơ sở dữ liệu nhỏ nhớ đăng ký kênh và lịch sử xem của bạn |
| **Companion** | Trợ giúp mở khóa các luồng video thật |

Bạn không cần hiểu sâu — file công thức lo hết mọi thứ.

---

## 🚀 Cài đặt — 6 bước đơn giản

### Bước 1 — Tạo thư mục

1. Mở **File Station**
2. Vào thư mục chia sẻ tên `docker`
   - *Chưa có?* → Control Panel → Shared Folder → Create → đặt tên `docker`
3. Bên trong `docker`, tạo thư mục con tên **`kv-tube`**

Đường dẫn sẽ dạng: `/docker/kv-tube`

---

### Bước 2 — Tải file công thức

1. Tải file này về máy tính:
   👉 [`docker-compose.yml`](https://raw.githubusercontent.com/vndangkhoa/kv-tube/main/docker-compose.yml)
   *(Bấm vào đường dẫn → chuột phải → Save As → giữ nguyên tên `docker-compose.yml`)*
2. Kéo thả file đó vào thư mục `/docker/kv-tube` trong File Station

> 💡 File này đơn giản là "công thức": nó bảo NAS tải 4 ứng dụng nào, kết nối chúng ra sao, và mở những "cửa" (cổng) nào.

---

### Bước 3 — Sửa 2 chỗ nhỏ trong file ⚠️ (quan trọng!)

Mở `docker-compose.yml` bằng trình soạn thảo (nhấp đôi trong File Station, hoặc dùng Notepad/VS Code) rồi sửa **2 giá trị**:

**① Thay `127.0.0.1` bằng IP của NAS** (đã xem ở danh sách kiểm tra)

Tìm dòng:
```yaml
      - NEXT_PUBLIC_INVIDIOUS_URL=http://127.0.0.1:7601
```
Sửa thành (ví dụ):
```yaml
      - NEXT_PUBLIC_INVIDIOUS_URL=http://192.168.1.10:7601
```

*Tại sao?* `127.0.0.1` nghĩa là "chính thiết bị này". Không sửa thì video chỉ chạy được trên chính NAS còn trên **điện thoại/laptop sẽ bị lỗi**.

**② (Tùy chọn — ai chỉ dùng trong LAN có thể bỏ qua)** Nếu sau này muốn truy cập từ internet, hãy thay domain của tác giả (`yt.khoavo.myds.me`, `youtube.khoavo.myds.me`) bằng tên DDNS của bạn. Dùng trong nhà/LAN thì giữ nguyên cũng được.

Lưu file lại.

---

### Bước 4 — Tạo Project trong Container Manager

1. Mở **Container Manager** (từ menu chính)
2. Menu trái → **Project** → bấm **Create**
3. Điền vào:
   - **Project name:** `kv-tube`
   - **Path:** bấm *Set path* → chọn `/docker/kv-tube`
   - **Source:** chọn **Upload docker-compose.yml** → trỏ tới file vừa sửa
4. Bấm **Next**

---

### Bước 5 — Build và chờ ☕

1. Các màn hình tiếp theo chỉ là tổng kết và tùy chọn — cứ yên tâm bấm **Next** hết
   *(Bỏ qua bước "Web portal" — không cần thiết)*
2. Bấm **Done**
3. Container Manager sẽ **tải 4 ứng dụng về và khởi động** (mất 1–3 phút)
4. Chờ cả 4 container chuyển sang **xanh / Running**:
   - ✅ `Invidious-Materialious-UI`
   - ✅ `Invidious`
   - ✅ `Invidious-DB`
   - ✅ `Invidious-COMPANION`

> ⏳ Lần đầu chạy hơi lâu — database cần thời gian chuẩn bị. Chờ thêm tối đa 2 phút sau khi mọi thứ xanh.

---

### Bước 6 — Mở YouTube riêng của bạn! 🎉

Trên trình duyệt bất kỳ trong mạng nhà, truy cập:

```
http://IP-CUA-NAS:3241
```

Ví dụ: `http://192.168.1.10:3241`

Bạn sẽ thấy trang chủ KV-Tube. Tìm một video và bấm phát thôi!

---

## 📱 Thêm: Cài như ứng dụng thật

Trên **điện thoại/tablet**, mở cùng địa chỉ trên bằng Chrome (Android) hoặc Safari (iPhone):

- **Android:** Menu ⋮ → *Add to Home screen*
- **iPhone:** Nút chia sẻ → *Add to Home Screen*

KV-Tube giờ mở toàn màn hình như app thuần, hỗ trợ nghe nền. 🎧

Ngoài ra còn có **ứng dụng Android gốc** (điện thoại + Android TV) — xem [README chính](README.md#-native-apps-mobile--tv).

---

## 🔄 Cách cập nhật sau này (nhận tính năng mới)

Khi có phiên bản mới:

1. Mở **Container Manager** → **Project** → `kv-tube`
2. Bấm **Stop**, rồi **Action → Build**
   *(Container Manager tự tải image mới nhất khi build)*
3. Xong thì bấm **Start**

Lịch sử xem và đăng ký kênh **an toàn tuyệt đối** — chúng nằm trong `/docker/kv-tube/data` và không bị xóa.

*(Biết dùng SSH? Một dòng thay thế: `cd /volume1/docker/kv-tube && sudo docker compose pull && sudo docker compose up -d`)*

---

## 🩺 Có vấn đề? Các cách sửa thường gặp

### ❗ Vấn đề 1: Container `Invidious` liên tục dừng (màu đỏ)

Log có chữ *"permission denied"*.

**Nguyên nhân:** trong file có dòng `user: 1026:100` — đó là ID tài khoản NAS của tác giả, còn của bạn thì khác.

**Cách sửa:**
1. Bật SSH: Control Panel → Terminal & SNMP → bật SSH
2. Kết nối: mở Terminal/PowerShell trên máy tính → `ssh TEN-DSM@IP-NAS` → gõ `id`
3. Ghi lại các số hiện ra, ví dụ `uid=1026(user)` và `gid=100(users)`
4. Trong `docker-compose.yml`, tìm dòng `user: 1026:100` thay bằng **con số của bạn**
5. Project → Stop → Build lại

### ❗ Vấn đề 2: Lỗi "Port already in use"

Ứng dụng khác đang chiếm cổng 3241 hoặc 7601.

**Cách sửa:** trong `docker-compose.yml`, chỉ đổi số **bên trái**:
```yaml
    ports:
      - "8241:3000"     # trước đây là "3241:3000"
```
Rồi nhớ địa chỉ mới: `http://IP-NAS:8241`

### ❗ Vấn đề 3: Web load được nhưng video không chạy trên điện thoại/máy tính

Bạn đã bỏ qua **Bước 3①** — quay lại thay `127.0.0.1` bằng IP của NAS, rồi Project → Stop → Build.

### ❗ Vấn đề 4: Trước xem được, hôm nay lỗi

YouTube hay thay đổi phía họ.

**Cách sửa:** khởi động lại: Container Manager → Project → `kv-tube` → **Restart**. Vẫn lỗi thì làm bước **cập nhật** (phần trên) — bản mới thường đã vá sẵn.

### 🆘 Vẫn kẹt?

Tạo issue tại: https://github.com/vndangkhoa/kv-tube/issues

---

## 🔒 Các bước nâng cao (không bắt buộc)

- 🌍 **Truy cập từ ngoài nhà (HTTPS):** xem [README chính — phần Reverse Proxy](README.md)
- 📦 **Cài qua Package Center (.spk):** xem [KV-Tube SPK](https://github.com/vndangkhoa/synology-spk)

---

<p align="center">
  <sub>Được xây với ❤️ bởi <a href="https://github.com/vndangkhoa">Khoa Vo</a> · <a href="https://github.com/vndangkhoa/kv-tube">⭐ Star dự án</a></sub>
</p>
