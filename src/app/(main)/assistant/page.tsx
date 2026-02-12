
'use client';

import { useActionState, useState, useRef, ChangeEvent, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Bot, Sparkles, AlertCircle, Upload, Youtube, Wrench, Mic, StopCircle, Play } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { diagnoseProblemAction, type DiagnoseState, transcribeAudioAction, textToSpeechAction } from '@/lib/actions';
import Image from 'next/image';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
                <>
                    <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                    Diagnosing...
                </>
            ) : (
                <>
                    <Bot className="mr-2 h-4 w-4" />
                    Get AI Diagnosis
                </>
            )}
        </Button>
    )
}

export default function AssistantPage() {
    const initialState: DiagnoseState = {};
    const [state, dispatch] = useActionState(diagnoseProblemAction, initialState);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    
    // Voice state
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const [diagnosisAudio, setDiagnosisAudio] = useState<string | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);


    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            setPreview(null);
        }
    };
    
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleStartRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            const audioChunks: Blob[] = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result as string;
                    setIsTranscribing(true);
                    const result = await transcribeAudioAction(base64Audio);
                    if (result && descriptionRef.current) {
                        descriptionRef.current.value = result;
                    }
                    setIsTranscribing(false);
                };
                // Stop all tracks to release the microphone
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (error) {
            console.error("Error starting recording:", error);
            alert("Could not start recording. Please make sure microphone access is allowed.");
        }
    };

    const handleStopRecording = () => {
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };
    
    useEffect(() => {
        if (state.result?.diagnosis) {
            setDiagnosisAudio(null);
            setIsSynthesizing(true);
            textToSpeechAction(state.result.diagnosis)
                .then(audioDataUri => {
                    setDiagnosisAudio(audioDataUri);
                })
                .catch(err => console.error("Error synthesizing audio:", err))
                .finally(() => setIsSynthesizing(false));
        }
    }, [state.result?.diagnosis]);

    const playDiagnosis = () => {
        if (diagnosisAudio && audioRef.current) {
            audioRef.current.play();
        }
    };

    const youtubeUrl = state.result?.youtubeSearchQuery 
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(state.result.youtubeSearchQuery)}`
        : '#';


    return (
        <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold font-headline">AI Vehicle Assistant</h1>
                    <p className="text-muted-foreground">Describe your issue, upload a photo, and get an AI-powered diagnosis.</p>
                </div>
                <Card>
                    <form action={dispatch}>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="description">Problem Description</Label>
                                <div className="relative">
                                    <Textarea 
                                        id="description" 
                                        name="description" 
                                        ref={descriptionRef}
                                        placeholder="e.g., 'There's a strange clicking sound coming from the front right wheel when I turn.'" 
                                        rows={4}
                                        required
                                        className="pr-20"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="absolute top-2 right-2"
                                      onClick={isRecording ? handleStopRecording : handleStartRecording}
                                      disabled={isTranscribing}
                                    >
                                      {isTranscribing ? <Sparkles className="h-5 w-5 animate-spin" /> : isRecording ? <StopCircle className="h-5 w-5 text-red-500" /> : <Mic className="h-5 w-5" />}
                                    </Button>
                                </div>
                                {state.errors?.description && <p className="text-sm text-destructive">{state.errors.description[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Photo of the Problem (Optional)</Label>
                                <Input 
                                    id="photo" 
                                    name="photo" 
                                    type="file" 
                                    accept="image/*" 
                                    ref={fileInputRef} 
                                    onChange={handleImageChange}
                                    className="hidden"
                                />
                                <Button type="button" variant="outline" onClick={handleUploadClick}>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Upload Image
                                </Button>
                                {state.errors?.photo && <p className="text-sm text-destructive">{state.errors.photo[0]}</p>}
                            </div>
                             {preview && (
                                <div className="mt-4">
                                    <p className="text-sm font-medium mb-2">Image Preview:</p>
                                    <Image src={preview} alt="Image preview" width={200} height={200} className="rounded-md border" />
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <SubmitButton />
                        </CardFooter>
                    </form>
                </Card>
            </div>
            
            <div className="flex flex-col">
                {state.message && !state.result && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{state.message}</AlertDescription>
                    </Alert>
                )}

                {!state.result ? (
                    <Card className="flex-grow flex flex-col items-center justify-center text-center p-8 border-dashed">
                       <div className="bg-secondary p-4 rounded-full mb-4">
                        <Bot className="h-12 w-12 text-muted-foreground" />
                       </div>
                        <h3 className="text-xl font-bold font-headline">Awaiting Diagnosis</h3>
                        <p className="text-muted-foreground mt-2 max-w-sm">Provide the problem details on the left, and the AI assistant will provide a diagnosis and a helpful video.</p>
                    </Card>
                ) : (
                    <Card className="flex-grow">
                        <CardHeader>
                            <CardTitle className="font-headline">Diagnosis Result</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <div className="flex items-center justify-between gap-2 text-muted-foreground mb-2">
                                    <div className="flex items-center gap-2">
                                        <Wrench className="h-5 w-5" />
                                        <h4 className="font-semibold text-lg text-foreground">AI Diagnosis</h4>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={playDiagnosis}
                                      disabled={!diagnosisAudio || isSynthesizing}
                                    >
                                      {isSynthesizing ? <Sparkles className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                                    </Button>
                                </div>
                                <p className="bg-secondary p-4 rounded-md">{state.result.diagnosis}</p>
                                {diagnosisAudio && <audio src={diagnosisAudio} ref={audioRef} />}
                            </div>
                             <div>
                                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                    <Youtube className="h-5 w-5" />
                                    <h4 className="font-semibold text-lg text-foreground">Recommended Video</h4>
                                </div>
                                <div className="bg-secondary p-4 rounded-md">
                                    <Link href={youtubeUrl} target="_blank" className="text-primary hover:underline font-medium break-all">
                                        Search YouTube for: {`"${state.result.youtubeSearchQuery}"`}
                                    </Link>
                                    <p className="text-sm text-muted-foreground mt-2">
                                        Watch this video for a visual guide and a potential solution.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
