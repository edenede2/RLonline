import streamlit as st

# Page configuration
st.set_page_config(
    page_title="Reversal Learning Task - Instructions",
    page_icon="🧠",
    layout="centered"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        text-align: center;
        color: #1E88E5;
    }
    .link-box {
        background-color: #f0f2f6;
        padding: 20px;
        border-radius: 10px;
        margin: 10px 0;
    }
    .step-number {
        background-color: #1E88E5;
        color: white;
        padding: 5px 12px;
        border-radius: 50%;
        font-weight: bold;
        margin-right: 10px;
    }
    .warning-box {
        background-color: #fff3cd;
        border: 1px solid #ffc107;
        padding: 15px;
        border-radius: 10px;
        margin: 10px 0;
    }
    .success-box {
        background-color: #d4edda;
        border: 1px solid #28a745;
        padding: 15px;
        border-radius: 10px;
        margin: 10px 0;
    }
</style>
""", unsafe_allow_html=True)

# Header
st.markdown("<h1 class='main-header'>🧠 Reversal Learning Task</h1>", unsafe_allow_html=True)
st.markdown("<h3 style='text-align: center; color: gray;'>Instructions & Resources</h3>", unsafe_allow_html=True)

st.divider()

# Quick Links Section
st.header("🔗 Quick Links")

col1, col2 = st.columns(2)

with col1:
    st.markdown("### 🎮 Run the Task")
    st.markdown("Click below to access the Reversal Learning Task:")
    st.link_button(
        "Open Task ↗",
        "https://reversal-task-fibro-5a8993d33382.herokuapp.com/",
        use_container_width=True
    )

with col2:
    st.markdown("### 📊 View Results")
    st.markdown("Access the Google Drive folder with all results:")
    st.link_button(
        "Open Results Folder ↗",
        "https://drive.google.com/drive/u/0/folders/1d5b2MuYbUFovp2p1h0QioYET5Jxk3ChL",
        use_container_width=True
    )

st.divider()

# Instructions Section
st.header("📋 How to Use")

st.markdown("### For Researchers: Setting Up a New Project")

st.markdown("""
<div class='warning-box'>
<strong>⚠️ Before running participants</strong>, you need to create a new spreadsheet for your project in the shared Google Drive folder.
</div>
""", unsafe_allow_html=True)

# Step by step instructions
st.markdown("#### Step-by-Step Setup:")

st.markdown("""
**Step 1️⃣ Download the Empty Template**

Download the empty spreadsheet template that contains the correct column structure:
""")

# Download link for the template
template_url = "https://github.com/edenede2/RLonline/raw/main/_EmptyReversalTaskData.xlsx"
st.link_button(
    "📥 Download Empty Template (.xlsx)",
    template_url,
    use_container_width=True
)

st.markdown("""
**Step 2️⃣ Create Your Project Spreadsheet**

1. Open the downloaded file in Excel or Google Sheets
2. **Important:** Upload it to the [shared Google Drive folder](https://drive.google.com/drive/u/0/folders/1d5b2MuYbUFovp2p1h0QioYET5Jxk3ChL)
3. Rename the file to your project name (e.g., `Study1_Control`, `Fibro_Pilot_2024`)
4. **Convert to Google Sheets format** (File → Save as Google Sheets)

""")

st.markdown("""
<div class='success-box'>
<strong>✅ Tip:</strong> The file must be a <strong>Google Sheets</strong> file (not .xlsx) for the task to write data to it.
</div>
""", unsafe_allow_html=True)

st.markdown("""
**Step 3️⃣ Run the Task**

1. Open the [Reversal Learning Task](https://reversal-task-fibro-5a8993d33382.herokuapp.com/)
2. Select your project from the dropdown menu
3. Enter the participant ID
4. Start the task!
""")

st.divider()

# For Participants Section
st.header("👤 For Participants")

st.markdown("""
If you're a participant in this study:

1. You will receive a direct link from your researcher
2. Enter your Participant ID when prompted
3. Follow the on-screen instructions
4. Complete all trials - **do not close the browser during the task**

**Technical Requirements:**
- Use a modern browser (Chrome, Firefox, Safari, Edge)
- Stable internet connection
- Complete the task in one session
""")

st.divider()

# Data Structure Section
with st.expander("📁 Data Structure (For Researchers)"):
    st.markdown("""
    The spreadsheet contains the following sheets:
    
    | Sheet Name | Description |
    |------------|-------------|
    | **TrialData** | Individual trial-level data (responses, timing, rewards) |
    | **BlockData** | Block-level summaries (performance, learning criteria) |
    | **TaskData** | Task-level summaries (one row per participant) |
    | **logData** | Backup log of all trial data |
    
    Each sheet has predefined columns - **do not modify the column headers**.
    """)

# Troubleshooting Section
with st.expander("🔧 Troubleshooting"):
    st.markdown("""
    **Project not appearing in dropdown?**
    - Make sure the file is in the correct Google Drive folder
    - Ensure the file is saved as **Google Sheets** (not .xlsx)
    - The service account needs access - contact the administrator
    
    **Data not saving?**
    - Check your internet connection
    - Make sure you selected the correct project at the start
    - Contact the research team if the problem persists
    
    **Task not loading?**
    - Try refreshing the page
    - Clear browser cache
    - Try a different browser
    """)

st.divider()

# Footer
st.markdown("""
<div style='text-align: center; color: gray; padding: 20px;'>
    <small>Reversal Learning Task | Developed for Research Purposes</small><br>
    <small>For technical support, contact the research team</small>
</div>
""", unsafe_allow_html=True)
