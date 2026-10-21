using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace CubeSatGroundStation {
    static class Program {
        private const string AppTitle = "CubeSat Ground Station";
        private const string DashboardUrl = "http://localhost:3000";
        private const string MutexName = "CubeSatGroundStation_AppMutex_7788";

        private static string projectDir = @"C:\Users\carvi\cubesat-groundstation-dashboard";
        private static string iconPath = @"C:\Users\carvi\cubesat-groundstation-dashboard\app_icon.ico";

        [STAThread]
        static void Main() {
            try {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                // Locate Project Directory
                string currentBase = AppDomain.CurrentDomain.BaseDirectory;
                if (File.Exists(Path.Combine(currentBase, "server.js"))) {
                    projectDir = currentBase;
                } else if (!Directory.Exists(projectDir)) {
                    DirectoryInfo parentInfo = Directory.GetParent(currentBase);
                    string parent = parentInfo != null ? parentInfo.FullName : null;
                    if (parent != null && File.Exists(Path.Combine(parent, "server.js"))) {
                        projectDir = parent;
                    }
                }

                if (File.Exists(Path.Combine(projectDir, "app_icon.ico"))) {
                    iconPath = Path.Combine(projectDir, "app_icon.ico");
                }

                // Reliable Single-Instance Check via Process Kernel Query
                Process current = Process.GetCurrentProcess();
                Process[] existing = Process.GetProcessesByName(current.ProcessName);
                if (existing.Length > 1) {
                    // Another instance is already running! Open dashboard window and exit
                    LaunchDashboardWindow();
                    return;
                }

                Application.Run(new GroundStationContext(projectDir, iconPath));
            } catch (Exception ex) {
                MessageBox.Show("CubeSat Ground Station Startup Error: " + ex.Message, "Ground Station", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        public static void LaunchDashboardWindow() {
            try {
                // Check Chrome first
                string userChrome = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe");
                string progChrome = @"C:\Program Files\Google\Chrome\Application\chrome.exe";
                string progChromeX86 = @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe";
                string chromePath = File.Exists(userChrome) ? userChrome : (File.Exists(progChrome) ? progChrome : (File.Exists(progChromeX86) ? progChromeX86 : null));

                // Check Edge
                string edgePath = @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe";
                if (!File.Exists(edgePath)) {
                    edgePath = @"C:\Program Files\Microsoft\Edge\Application\msedge.exe";
                }

                if (chromePath != null) {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = chromePath;
                    psi.Arguments = string.Format("--app=\"{0}\" --window-size=1600,960", DashboardUrl);
                    Process.Start(psi);
                } else if (File.Exists(edgePath)) {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = edgePath;
                    psi.Arguments = string.Format("--app=\"{0}\" --window-size=1600,960", DashboardUrl);
                    Process.Start(psi);
                } else {
                    Process.Start(DashboardUrl);
                }
            } catch {
                try {
                    Process.Start(DashboardUrl);
                } catch { }
            }
        }
    }

    public class GroundStationContext : ApplicationContext {
        private const string DashboardUrl = "http://localhost:3000";
        private string projectDir;
        private string iconPath;
        private Process serverProcess;
        private NotifyIcon trayIcon;

        public GroundStationContext(string dir, string icon) {
            this.projectDir = dir;
            this.iconPath = icon;

            // Show Splash Screen
            using (SplashForm splash = new SplashForm(iconPath)) {
                splash.Show();
                Application.DoEvents();

                splash.SetStatus("Checking Ground Station server status...");

                bool isOnline = CheckServerOnline();
                if (!isOnline) {
                    splash.SetStatus("Booting 6U CubeSat Node telemetry engine...");
                    StartServer();

                    int retries = 0;
                    while (!isOnline && retries < 40) {
                        Thread.Sleep(250);
                        isOnline = CheckServerOnline();
                        retries++;
                    }
                }

                splash.SetStatus("Ground Station Ready! Opening telemetry dashboard...");
                Thread.Sleep(400);

                Program.LaunchDashboardWindow();
                splash.Close();
            }

            // Setup Tray Icon
            SetupTray();
        }

        private bool CheckServerOnline() {
            try {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(DashboardUrl + "/api/status");
                req.Timeout = 1200;
                req.Method = "GET";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse()) {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            } catch {
                return false;
            }
        }

        private void StartServer() {
            try {
                string nodePath = "node";
                string standardNode = @"C:\Program Files\nodejs\node.exe";
                if (File.Exists(standardNode)) {
                    nodePath = standardNode;
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodePath;
                psi.Arguments = "server.js";
                psi.WorkingDirectory = projectDir;
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                serverProcess = Process.Start(psi);
            } catch (Exception ex) {
                MessageBox.Show("Failed to launch Ground Station server: " + ex.Message, "CubeSat Ground Station Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void SetupTray() {
            trayIcon = new NotifyIcon();
            if (File.Exists(iconPath)) {
                try {
                    trayIcon.Icon = new Icon(iconPath);
                } catch {
                    trayIcon.Icon = SystemIcons.Application;
                }
            } else {
                trayIcon.Icon = SystemIcons.Application;
            }

            trayIcon.Text = "CubeSat Ground Station - Online (Port 3000)";
            trayIcon.Visible = true;

            ContextMenu menu = new ContextMenu();
            menu.MenuItems.Add("🛰️ Open Dashboard Window", (s, e) => Program.LaunchDashboardWindow());
            menu.MenuItems.Add("🌐 Open in Default Web Browser", (s, e) => Process.Start(DashboardUrl));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("🔄 Restart Ground Station Server", (s, e) => {
                if (serverProcess != null && !serverProcess.HasExited) {
                    try { serverProcess.Kill(); } catch { }
                }
                StartServer();
                Thread.Sleep(1000);
                Program.LaunchDashboardWindow();
            });
            menu.MenuItems.Add("📁 Open Project Folder", (s, e) => Process.Start("explorer.exe", projectDir));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("❌ Exit Ground Station", (s, e) => {
                Cleanup();
                ExitThread();
            });

            trayIcon.ContextMenu = menu;
            trayIcon.DoubleClick += (s, e) => Program.LaunchDashboardWindow();

            trayIcon.ShowBalloonTip(3000, "CubeSat Ground Station Active", "Server running on port 3000. Double-click tray icon to open dashboard.", ToolTipIcon.Info);
        }

        private void Cleanup() {
            if (trayIcon != null) {
                trayIcon.Visible = false;
                trayIcon.Dispose();
                trayIcon = null;
            }

            if (serverProcess != null && !serverProcess.HasExited) {
                try {
                    serverProcess.Kill();
                } catch { }
                serverProcess = null;
            }
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                Cleanup();
            }
            base.Dispose(disposing);
        }
    }

    public class SplashForm : Form {
        private Label lblTitle;
        private Label lblSubtitle;
        private Label lblStatus;
        private ProgressBar progressBar;
        private System.Windows.Forms.Timer animTimer;
        private int progressValue = 10;

        public SplashForm(string iconPath) {
            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.Size = new Size(460, 220);
            this.BackColor = Color.FromArgb(15, 23, 42); // Slate 900
            this.ShowInTaskbar = false;
            this.TopMost = true;

            if (File.Exists(iconPath)) {
                try {
                    this.Icon = new Icon(iconPath);
                } catch { }
            }

            // Title
            lblTitle = new Label();
            lblTitle.Text = "🛰️ CUBESAT GROUND STATION";
            lblTitle.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            lblTitle.ForeColor = Color.White;
            lblTitle.Location = new Point(25, 28);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            // Subtitle
            lblSubtitle = new Label();
            lblSubtitle.Text = "UHF 440.000 MHz LoRa & 3D Telemetry Flight Suite";
            lblSubtitle.Font = new Font("Segoe UI", 10f, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(147, 197, 253); // Light Blue
            lblSubtitle.Location = new Point(28, 65);
            lblSubtitle.AutoSize = true;
            this.Controls.Add(lblSubtitle);

            // Status Text
            lblStatus = new Label();
            lblStatus.Text = "Initializing Ground Station subsystem...";
            lblStatus.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(203, 213, 225); // Slate 300
            lblStatus.Location = new Point(28, 115);
            lblStatus.Size = new Size(400, 25);
            this.Controls.Add(lblStatus);

            // Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(28, 145);
            progressBar.Size = new Size(404, 8);
            progressBar.Style = ProgressBarStyle.Continuous;
            progressBar.Value = 20;
            this.Controls.Add(progressBar);

            // Tag footer
            Label lblFooter = new Label();
            lblFooter.Text = "ALPHA-GS1 • CHANDIGARH (30.768776° N, 76.573955° E) • PORT 3000";
            lblFooter.Font = new Font("Segoe UI", 7.5f, FontStyle.Bold);
            lblFooter.ForeColor = Color.FromArgb(96, 165, 250); // Sky Blue
            lblFooter.Location = new Point(28, 178);
            lblFooter.AutoSize = true;
            this.Controls.Add(lblFooter);

            // Smooth progress animation
            animTimer = new System.Windows.Forms.Timer();
            animTimer.Interval = 40;
            animTimer.Tick += (s, e) => {
                if (progressValue < 95) {
                    progressValue += 3;
                    progressBar.Value = Math.Min(100, progressValue);
                }
            };
            animTimer.Start();
        }

        public void SetStatus(string text) {
            if (lblStatus.InvokeRequired) {
                lblStatus.Invoke(new Action(() => lblStatus.Text = text));
            } else {
                lblStatus.Text = text;
            }
            Application.DoEvents();
        }

        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e);
            // Draw Aerospace Blue / Red border
            using (Pen borderPen = new Pen(Color.FromArgb(37, 99, 235), 2.5f)) {
                e.Graphics.DrawRectangle(borderPen, 1, 1, this.Width - 2, this.Height - 2);
            }
            // Red accent corner indicator
            using (SolidBrush redBrush = new SolidBrush(Color.FromArgb(220, 38, 38))) {
                e.Graphics.FillRectangle(redBrush, this.Width - 16, 2, 14, 14);
            }
        }

        protected override void Dispose(bool disposing) {
            if (disposing) {
                if (animTimer != null) animTimer.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
