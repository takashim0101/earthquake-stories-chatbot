import os
import time
from dotenv import load_dotenv
import random
import json
import requests
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import confusion_matrix, classification_report

# Load environment variables from .env file
load_dotenv()

# -----------------------
# LM Studio API Settings
# -----------------------
# Access the variables
LM_STUDIO_API = os.getenv("LM_STUDIO_API")
MODEL = os.getenv("MODEL")

# Ensure the variables were loaded (Optional check, but good practice)
if not LM_STUDIO_API or not MODEL:
    print("FATAL ERROR: LM_STUDIO_API or MODEL not found in .env file.")
    exit(1)

# -----------------------
# Local Story Analyzer (Sentiment + Summary)
# -----------------------
def analyze_sentiment_lmstudio(text, max_retries=3):
    """
    Sends text to LM Studio local API and returns sentiment, summary, and raw LLM output.
    Returns: A tuple (sentiment: str, summary: str, raw_output: str)
    """
    system_prompt = """You are an expert sentiment classifier and summarizer. Your task is to analyze the user's input (a disaster story) and respond ONLY with a raw JSON object containing two keys:
1. "sentiment": must be exactly one word: 'positive', 'negative', or 'neutral'.
2. "summary": A concise, one-sentence summary of the story (max 50 words).

DO NOT add any explanation, code fences (```json), quotation marks around the JSON, or any extra text outside the JSON object itself.

Here are some examples:

Text: “He patched me in” ... (story content) ...
Response: {"sentiment": "positive", "summary": "Despite being separated by distance, a man happily reconnected with his 90-year-old mother via a clear three-way video conversation patched in by his son."}

Text: 41.5 weeks pregnant and on the way to the hospital... (story content) ...
Response: {"sentiment": "negative", "summary": "A woman's attempt to reach the hospital for induction was thwarted by traffic and chaos following the earthquake, forcing her to return home."}

Text: I was the manager of the restaurant... (story content) ...
Response: {"sentiment": "neutral", "summary": "A restaurant manager experienced the earthquake while protecting oven dishes, noting the strange behavior of freezers before finding shelter in a doorway."}
"""
    
    user_prompt = f"""
Text: {text}
Response:""" # Prompt the model to output the JSON object after this line

    full_prompt = system_prompt + "\n\n" + user_prompt 
    
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": full_prompt}
        ],
        "temperature": 0.0, 
        "max_tokens": 150  # Increased max_tokens for JSON output
    }

    for attempt in range(max_retries):
        try:
            # 1. PRIMARY API CALL (Only one is needed per attempt)
            response = requests.post(LM_STUDIO_API, json=payload, timeout=180)
            response.raise_for_status() 
            
            data = response.json()
            json_raw = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            
            # --- 🛠️ FIX: Robust JSON Extraction and Typos ---
            
            json_cleaned = json_raw.strip()

            # 1. Forcefully find the valid JSON object using string indices
            #    (Uses rindex for '}' to ensure capturing the last brace if the model adds trailing text)
            try:
                # Find the start of the JSON object (first '{')
                start_index = json_cleaned.index('{')
                # Find the end of the JSON object (last '}')
                end_index = json_cleaned.rindex('}') + 1
                
                # Slice the string to include only the content from the first '{' to the last '}'
                json_to_parse = json_cleaned[start_index:end_index]
                
            except ValueError as ve:
                # This handles cases where '{' or '}' are missing entirely
                raise Exception(f"Failed to find valid JSON structure markers. Error: {ve}")

            # 2. Use json.loads to parse the extracted string
            parsed_data = json.loads(json_to_parse)
            
            sentiment = parsed_data.get("sentiment", "neutral").lower().strip()
            summary = parsed_data.get("summary", "No summary provided").strip()
            
            # 3. Autocorrect the common LLM typo: "neutrral" to "neutral"
            if sentiment == "neutrral":
                sentiment = "neutral"

            # Final validation
            if sentiment in ["positive", "negative", "neutral"] and summary:
                # FIX: Return the required three values
                return sentiment, summary, json_raw
            else:
                # Raise exception if final validation fails (e.g., sentiment is an unrecognized word)
                raise Exception(f"Parsed JSON validation failed. Sentiment: {sentiment}, Summary: {summary}") 
        
        except requests.exceptions.RequestException as e:
            if attempt < max_retries - 1:
                wait_time = 2**(attempt + 1)
                print(f"⚠️ Error contacting LM Studio API (Attempt {attempt + 1}/{max_retries}): {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            else:
                print(f"❌ LM Studio API failed after {max_retries} attempts: {e}")
                # FIX: Return a tuple for API error
                return "neutral", "API Error", "API_ERROR"

        except Exception as e:
            # This handles json.JSONDecodeError, ValueError from index(), and custom validation exceptions
            # Note: json_raw must be defined before reaching this point, which it is if the API call succeeded.
            if attempt < max_retries - 1:
                wait_time = 2**(attempt + 1)
                # Print the raw output that failed to help with debugging
                print(f"⚠️ Internal processing error (Attempt {attempt + 1}/{max_retries}): Failed to parse LLM JSON output: {json_raw[:100]}... Error: {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
                continue
            else:
                print(f"❌ Internal processing failed after {max_retries} attempts: Failed to parse LLM JSON output: {json_raw[:100]}... Error: {e}")
                # FIX: Return a tuple for internal error
                return "neutral", "Parse Error", json_raw
    
    return "neutral", "Unknown Error", "UNKNOWN_ERROR"
# -----------------------
# Main preprocessing function
# -----------------------
def preprocess_victim_stories(data_dir: str, output_json: str):
    """
    Loads .txt stories, manually labels 30 random samples, then auto-analyzes the rest with LM Studio.
    Saves output as analyzed_stories.json and generates confusion matrix + sentiment chart.
    """
    all_files = [f for f in os.listdir(data_dir) if f.endswith(".txt")]
    random.shuffle(all_files)

    manual_samples = all_files[:30]
    auto_samples = all_files[30:]

    analyzed_data = []
    ground_truth = {}

    print("🟢 Step 1: Manual labeling of 30 random samples (Sentiment only)\n")
    for f in manual_samples:
        file_path = os.path.join(data_dir, f)
        with open(file_path, "r", encoding="utf-8") as infile:
            content = infile.read().strip()

        print(f"\n📄 File: {f}\n--- Preview ---\n{content[:400]}\n")
        label = input("Enter sentiment (positive / negative / neutral): ").strip().lower()
        # Accept short forms
        if label in ["pos", "+"]:
            label = "positive"
        elif label in ["neg", "-"]:
            label = "negative"
        elif label not in ["positive", "negative", "neutral"]:
            label = "neutral"

        ground_truth[f] = label
        analyzed_data.append({
            "story_id": f,
            "text": content,
            "sentiment": label,
            "summary": "Manual analysis does not generate a summary.", # Placeholder for manual entries
            "method": "manual"
        })

    print("\n🟢 Step 2: LM Studio auto analysis for remaining files...\n")
    for f in auto_samples:
        file_path = os.path.join(data_dir, f)
        with open(file_path, "r", encoding="utf-8") as infile:
            content = infile.read().strip()
            
        trimmed_content = content[:1500]
        
        # FIX: The function now returns three values
        sentiment, summary, raw_output = analyze_sentiment_lmstudio(trimmed_content) 
        
        analyzed_data.append({
            "story_id": f,
            "text": content, 
            "sentiment": sentiment,
            "summary": summary, # ADDED: Summary to the output JSON
            "method": "lmstudio"
        })

    # -----------------------
    # Save JSON output
    # -----------------------
    try:
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump(analyzed_data, f, indent=4, ensure_ascii=False)
        print(f"✅ Saved analysis results to {output_json}")
    except Exception as e:
        print(f"❌ Error saving JSON: {e}")

    # -----------------------
    # Visualization
    # -----------------------
    print("\n🟢 Step 3: Generating charts...\n")
    sentiments = [entry["sentiment"] for entry in analyzed_data]
    plt.figure(figsize=(6, 4))
    sns.countplot(x=sentiments, order=["positive", "neutral", "negative"])
    plt.title("Sentiment Distribution (Manual + LM Studio)")
    plt.savefig(os.path.join(os.path.dirname(output_json), "sentiment_distribution.png"))
    plt.close()

    # Confusion matrix comparison for manual subset
    print("🟢 Step 4: Evaluating LM Studio performance on manual subset...\n")
    true_labels = list(ground_truth.values())
    predicted_labels = []
    
    for f in manual_samples:
        file_path = os.path.join(data_dir, f)
        with open(file_path, "r", encoding="utf-8") as infile:
            story = infile.read()
            
        trimmed_story = story[:1500] 
        
        # FIX: Only the first value (sentiment) is needed for the confusion matrix
        sentiment, _, _ = analyze_sentiment_lmstudio(trimmed_story) 
        predicted_labels.append(sentiment)

    cm = confusion_matrix(true_labels, predicted_labels, labels=["positive", "neutral", "negative"])
    
    # Visualization and Saving (No changes needed here)
    plt.figure(figsize=(5, 4))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=["positive", "neutral", "negative"],
                yticklabels=["positive", "neutral", "negative"])
    plt.xlabel("Predicted (LM Studio)")
    plt.ylabel("Actual (Manual)")
    plt.title("Confusion Matrix - LM Studio vs Manual")
    plt.tight_layout()
    plt.savefig(os.path.join(os.path.dirname(output_json), "confusion_matrix.png"))
    plt.close()

    # Optional: detailed classification report
    report = classification_report(true_labels, predicted_labels, target_names=["positive", "neutral", "negative"], output_dict=True)
    report_path = os.path.join(os.path.dirname(output_json), "analyzed_stories_evaluation_metrics.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=4)
    print(f"📊 Evaluation report saved to {report_path}")

    print("\n✅ All done! Outputs:")
    print(" - analyzed_stories.json")
    print(" - sentiment_distribution.png")
    print(" - confusion_matrix.png")
    print(" - analyzed_stories_evaluation_metrics.json")

# -----------------------
# Run script
# -----------------------
if __name__ == "__main__":
    data_dir = r"C:\Level 5\Hackthon_AI_ChatBot\data"
    output_json = r"C:\Level 5\Hackthon_AI_ChatBot\chatbot-api\analyzed_stories.json"
    preprocess_victim_stories(data_dir, output_json)