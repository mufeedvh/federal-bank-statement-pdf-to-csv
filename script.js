// Get references to the DOM elements
const dropArea = document.getElementById("drop-area");
const fileElem = document.getElementById("fileElem");
const passwordContainer = document.getElementById("password-container");
const passwordInput = document.getElementById("password-input");
const passwordError = document.getElementById("password-error");
const parseButton = document.getElementById("parse-button");
const downloadLink = document.getElementById("download-link");
const progress = document.getElementById("progress");
const progressText = document.getElementById("progress-text");
const downloadContainer = document.getElementById("download-container");
const csvPreview = document.getElementById("csv-preview");
const csvHeader = document.getElementById("csv-header");
const csvBody = document.getElementById("csv-body");

let pdfFile;
let pdfPassword = "";
let extractedText = "";
let fileName = "";

// Check if all required elements exist
if (!dropArea || !fileElem || !passwordContainer || !passwordInput || !passwordError || !parseButton || !downloadLink || !progress || !progressText || !downloadContainer || !csvPreview || !csvHeader || !csvBody) {
    console.error("One or more required elements are missing from the DOM");
} else {
    // Prevent default drag behaviors
    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop area when item is dragged over it
    ["dragenter", "dragover"].forEach((eventName) => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ["dragleave", "drop"].forEach((eventName) => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    // Handle drop event
    dropArea.addEventListener("drop", handleDrop, false);

    // Handle file selection
    fileElem.addEventListener("change", () => handleFiles(fileElem.files), false);

    // Add click event for parse button
    parseButton.addEventListener("click", () => {
        pdfPassword = passwordInput.value;
        if (pdfFile) {
            loadPDFWithPassword(pdfFile, pdfPassword);
        } else {
            console.error("No PDF file selected");
        }
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    dropArea.classList.add("ring-2", "ring-blue-500", "ring-offset-2");
}

function unhighlight() {
    dropArea.classList.remove("ring-2", "ring-blue-500", "ring-offset-2");
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length > 0) {
        pdfFile = files[0];
        fileName = pdfFile.name;
        // Check if the PDF is password-protected
        checkIfPDFIsPasswordProtected(pdfFile);
    }
}

// Check if the PDF is password-protected
function checkIfPDFIsPasswordProtected(file) {
    dropArea.classList.add("hidden");
    progress.classList.remove("hidden");
    progressText.textContent = "Checking PDF...";

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);

        const loadingTask = pdfjsLib.getDocument({
            data: typedarray,
            password: "",
        });

        loadingTask.promise.then(
            function (pdf) {
                // PDF is not password-protected
                progress.classList.add("hidden");
                extractTextFromPDF(pdf);
            },
            function (reason) {
                if (reason.name === "PasswordException") {
                    // PDF is password-protected
                    progress.classList.add("hidden");
                    passwordContainer.classList.remove("hidden");
                } else {
                    console.error("Error loading PDF:", reason);
                    showError("Error loading PDF. Please try again.");
                    resetUI();
                }
            }
        );
    };
    fileReader.readAsArrayBuffer(file);
}

function loadPDFWithPassword(file, password) {
    passwordContainer.classList.add("hidden");
    progress.classList.remove("hidden");
    progressText.textContent = "Loading PDF...";

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);

        const loadingTask = pdfjsLib.getDocument({data: typedarray,
            password: password,
        });

        loadingTask.promise.then(
            function (pdf) {
                // PDF loaded successfully with password
                extractTextFromPDF(pdf);
            },
            function (reason) {
                console.error("Error loading PDF with password:", reason);
                showError("Incorrect password. Please try again.");
                passwordContainer.classList.remove("hidden");
                progress.classList.add("hidden");
            }
        );
    };
    fileReader.readAsArrayBuffer(file);
}

function showError(message) {
    passwordError.textContent = message;
    passwordError.classList.remove("hidden");
}

// Extract text from PDF
function extractTextFromPDF(pdf) {
    progressText.textContent = "Extracting text...";
    let totalPages = pdf.numPages;
    let countPromises = []; // collecting all page promises

    for (let j = 1; j <= totalPages; j++) {
        let page = pdf.getPage(j);

        countPromises.push(
            page.then(function (page) {
                let textContent = page.getTextContent();
                return textContent.then(function (text) {
                    return text.items
                        .map(function (s) {
                            return s.str;
                        })
                        .join(" ");
                });
            })
        );
    }

    Promise.all(countPromises).then(function (texts) {
        extractedText = texts.join("\n");
        progressText.textContent = "Parsing text...";
        // Call the parser function
        let csvContent = parseBankStatement(extractedText);
        // Create a Blob and set up download link
        let blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        let url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = fileName.replace('.pdf', '.csv');
        progress.classList.add("hidden");
        downloadContainer.classList.remove("hidden");
        visualizeCSV(csvContent);
    });
}

function resetUI() {
    dropArea.classList.remove("hidden");
    progress.classList.add("hidden");
    passwordContainer.classList.add("hidden");
    downloadContainer.classList.add("hidden");
    csvPreview.classList.add("hidden");
    if (fileElem) fileElem.value = ""; // Reset file input
    if (passwordInput) passwordInput.value = ""; // Reset password input
    if (passwordError) {
        passwordError.textContent = ""; // Clear any error messages
        passwordError.classList.add("hidden");
    }
    pdfFile = null;
    pdfPassword = "";
    extractedText = "";
    fileName = "";
}

function parseBankStatement(inputText) {
    const transactions = [];
    let prevBalance = null;
  
    // Preprocess the data
    // Remove unwanted headers and footers
    inputText = inputText.replace(
      /[\s\S]*?Date\s+Value Date\s+Particulars\s+Tran Type[\s\S]*?Opening Balance\s+\d+,\d+\.\d{2}\s+Cr\s+/i,
      ""
    );
    inputText = inputText.replace(/\s+GRAND TOTAL[\s\S]*/i, "");
  
    // Normalize spaces
    inputText = inputText.replace(/\s+/g, " ");
  
    // Regular expression to match transactions
    const transactionPattern = new RegExp(
      "(?<=\\s|^)" +
        "(?<Date>\\d{2}-[A-Z]{3}-\\d{4})\\s+" +
        "(?<ValueDate>\\d{2}-[A-Z]{3}-\\d{4})\\s+" +
        "(?<Particulars>.+?)\\s+" +
        "(?<TranType>TFR|FT|CLG|SBINT|MB|POS|CHRG|IFN)\\s+" +
        "(?<TranID>\\S+)\\s+" +
        "(?<Amounts>(?:\\d+(?:,\\d{3})*\\.\\d{2}\\s+)+)" +
        "(?<Balance>\\d+(?:,\\d{3})*\\.\\d{2})\\s+" +
        "(?<DRCR>Cr|Dr)" +
        "(?=\\s|$)",
      "gi"
    );
  
    let match;
    while ((match = transactionPattern.exec(inputText)) !== null) {
      const transaction = {
        Date: match.groups.Date,
        "Value Date": match.groups.ValueDate,
        Particulars: match.groups.Particulars.trim(),
        "Tran Type": match.groups.TranType,
        "Tran ID": match.groups.TranID,
        "Cheque Details": "",
        Withdrawals: "",
        Deposits: "",
        Balance: match.groups.Balance.replace(/,/g, ""),
        "DR/CR": match.groups.DRCR,
      };
  
      // Process amounts
      const amounts = match.groups.Amounts.trim()
        .split(/\s+/)
        .map((a) => a.replace(/,/g, ""));
      if (amounts.length === 1) {
        // Only one amount, need to determine if it's a withdrawal or deposit
        const amount = parseFloat(amounts[0]);
        const balance = parseFloat(transaction["Balance"]);
        if (prevBalance !== null) {
          const delta = balance - prevBalance;
          if (Math.abs(delta + amount) < 0.01) {
            transaction["Withdrawals"] = amounts[0];
          } else if (Math.abs(delta - amount) < 0.01) {
            transaction["Deposits"] = amounts[0];
          } else {
            // Unable to determine, default to withdrawals
            transaction["Withdrawals"] = amounts[0];
          }
        } else {
          // No previous balance, unable to determine
          transaction["Withdrawals"] = amounts[0];
        }
      } else if (amounts.length === 2) {
        transaction["Withdrawals"] = amounts[0];
        transaction["Deposits"] = amounts[1];
      }
  
      prevBalance = parseFloat(transaction["Balance"]);
      transactions.push(transaction);
    }
  
    return generateCSV(transactions);
}
  
// Helper function to generate CSV
function generateCSV(transactions) {
    const header = [
      "Date",
      "Value Date",
      "Particulars",
      "Tran Type",
      "Tran ID",
      "Cheque Details",
      "Withdrawals",
      "Deposits",
      "Balance",
      "DR/CR",
    ];
  
    const rows = transactions.map((txn) => {
      return header.map((field) => txn[field] || "").join(",");
    });
  
    return [header.join(","), ...rows].join("\n");
}

function visualizeCSV(csvContent) {
    const rows = csvContent.split("\n");
    const header = rows[0].split(",");
    const data = rows.slice(1);

    // Clear existing content
    csvHeader.innerHTML = "";
    csvBody.innerHTML = "";

    // Add header
    header.forEach(columnName => {
        const th = document.createElement("th");
        th.textContent = columnName;
        th.className = "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
        csvHeader.appendChild(th);
    });

    // Add data rows (limit to first 10 rows for preview)
    data.slice(0, 10).forEach(row => {
        const tr = document.createElement("tr");
        row.split(",").forEach(cellData => {
            const td = document.createElement("td");
            td.textContent = cellData;
            td.className = "px-6 py-4 whitespace-nowrap text-sm text-gray-500";
            tr.appendChild(td);
        });
        csvBody.appendChild(tr);
    });

    // Show the CSV preview
    csvPreview.classList.remove("hidden");
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.12.313/pdf.worker.min.js';